import Foundation
import VideoToolbox
import CoreVideo
import Darwin

/// Hardware HEVC encoding for gain-map tiles via VideoToolbox.
///
/// Each tile is a packed I420 (Y, then U, then V) frame that is wrapped in a
/// CVPixelBuffer and encoded to an Annex-B HEVC byte stream.  A real
/// VTCompressionSession configure attempt is used to probe 4:2:0 support,
/// mirroring the Android MediaCodecHevcEncoder.
enum VideoToolboxHEVCEncoder {
    static let tileSize = 512

    private final class CallbackRef {
        var data = Data()
        var includeParameterSets = false
    }

    private final class EncoderSession {
        let session: VTCompressionSession
        let callback: CallbackRef
        let width: Int
        let height: Int
        var frameIndex: Int64 = 0

        init(session: VTCompressionSession, callback: CallbackRef, width: Int, height: Int) {
            self.session = session
            self.callback = callback
            self.width = width
            self.height = height
        }

        deinit { VTCompressionSessionInvalidate(session) }
    }

    // Rust invokes tile callbacks synchronously on the conversion's thread.
    // Keep each batch isolated, including simultaneous photo conversions.
    private static let sessionKey = "dev.komorebi.styles.hevc-session"
    static let isSupported = canEncode420()

    static func finishConversion() {
        Thread.current.threadDictionary.removeObject(forKey: sessionKey)
    }

    static func encodePixels(
        _ pixels: Data,
        width: Int,
        height: Int,
        pixelBytes: Int,
        includeParameterSets: Bool
    ) -> Data? {
        guard let i420 = packedI420(
            pixels: pixels,
            width: width,
            height: height,
            pixelBytes: pixelBytes
        ) else { return nil }
        return encodeTile(yuv: i420, width: width, height: height, includeParameterSets: includeParameterSets)
    }

    private static func packedI420(
        pixels: Data,
        width: Int,
        height: Int,
        pixelBytes: Int
    ) -> Data? {
        guard width > 0, height > 0, pixelBytes == 1 || pixelBytes == 3,
              pixels.count >= width * height * pixelBytes else { return nil }
        let chromaW = (width + 1) / 2
        let chromaH = (height + 1) / 2
        if pixelBytes == 1 {
            var output = Data(pixels.prefix(width * height))
            output.append(Data(repeating: 128, count: 2 * chromaW * chromaH))
            return output
        }
        var y = [UInt8](repeating: 0, count: width * height)
        var uFull = [UInt8](repeating: 128, count: width * height)
        var vFull = [UInt8](repeating: 128, count: width * height)

        pixels.withUnsafeBytes { raw in
            let source = raw.bindMemory(to: UInt8.self)
            for index in 0..<(width * height) {
                let r = Double(source[index * 3])
                let g = Double(source[index * 3 + 1])
                let b = Double(source[index * 3 + 2])
                let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
                y[index] = UInt8(clamping: Int(luma.rounded()))
                uFull[index] = UInt8(clamping: Int((((b - luma) * 0.5389) + 128).rounded()))
                vFull[index] = UInt8(clamping: Int((((r - luma) * 0.6350) + 128).rounded()))
            }
        }

        var u = [UInt8](repeating: 128, count: chromaW * chromaH)
        var v = [UInt8](repeating: 128, count: chromaW * chromaH)
        if pixelBytes == 3 {
            for cy in 0..<chromaH {
                for cx in 0..<chromaW {
                    var uSum = 0
                    var vSum = 0
                    var count = 0
                    for dy in 0..<2 {
                        let sy = min(cy * 2 + dy, height - 1)
                        for dx in 0..<2 {
                            let sx = min(cx * 2 + dx, width - 1)
                            let index = sy * width + sx
                            uSum += Int(uFull[index])
                            vSum += Int(vFull[index])
                            count += 1
                        }
                    }
                    u[cy * chromaW + cx] = UInt8(uSum / count)
                    v[cy * chromaW + cx] = UInt8(vSum / count)
                }
            }
        }

        var output = Data(y)
        output.append(contentsOf: u)
        output.append(contentsOf: v)
        return output
    }

    /// Probe 4:2:0 HEVC once; device support is stable for the app's lifetime.
    static func canEncode420() -> Bool {
        var session: VTCompressionSession?
        let status = VTCompressionSessionCreate(
            allocator: kCFAllocatorDefault,
            width: 64,
            height: 64,
            codecType: kCMVideoCodecType_HEVC,
            encoderSpecification: nil,
            imageBufferAttributes: nil,
            compressedDataAllocator: kCFAllocatorDefault,
            outputCallback: nil,
            refcon: nil,
            compressionSessionOut: &session
        )
        guard status == noErr, let session = session else {
            return false
        }
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_ProfileLevel,
                             value: kVTProfileLevel_HEVC_Main_AutoLevel as CFTypeRef)
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_RealTime,
                             value: kCFBooleanTrue)
        VTCompressionSessionPrepareToEncodeFrames(session)
        VTCompressionSessionInvalidate(session)
        return true
    }

    /// Configure one encoder for a batch of independent HEVC tiles.
    private static func makeSession(width: Int, height: Int) -> EncoderSession? {
        let ref = CallbackRef()
        let refPtr = Unmanaged.passUnretained(ref).toOpaque()

        let w = Int32(width)
        let h = Int32(height)

        var session: VTCompressionSession?
        let status = VTCompressionSessionCreate(
            allocator: kCFAllocatorDefault,
            width: w,
            height: h,
            codecType: kCMVideoCodecType_HEVC,
            encoderSpecification: nil,
            imageBufferAttributes: nil,
            compressedDataAllocator: kCFAllocatorDefault,
            outputCallback: { outputCallbackRefCon, _sourceFrameRefCon, status, _flags, sampleBuffer in
                guard status == noErr, let sampleBuffer = sampleBuffer else { return }
                let ctx = Unmanaged<CallbackRef>.fromOpaque(outputCallbackRefCon!).takeUnretainedValue()
                // The first tile of a conversion carries VPS/SPS/PPS (from
                // VideoToolbox's format description) so Rust can build the hvcC
                // decoder config. Later tiles are pure IDR slices.
                let isFirst = ctx.includeParameterSets
                if isFirst,
                   let fmt = CMSampleBufferGetFormatDescription(sampleBuffer),
                   let ext = CMFormatDescriptionGetExtensions(fmt) as? [String: Any],
                   let atoms = ext["SampleDescriptionExtensionAtoms"] as? NSDictionary,
                   let hvcCData = atoms["hvcC"] as? Data {
                    ctx.data.append(VideoToolboxHEVCEncoder.hvccToAnnexB(hvcCData))
                }
                if let dataBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) {
                    var length = 0
                    var dataPtr: UnsafeMutablePointer<Int8>?
                    CMBlockBufferGetDataPointer(dataBuffer, atOffset: 0,
                                                lengthAtOffsetOut: nil, totalLengthOut: &length,
                                                dataPointerOut: &dataPtr)
                    if let dataPtr = dataPtr, length > 0 {
                        // VideoToolbox emits length-prefixed (AVCC) NALs, but
                        // the Rust assembler expects Annex-B start codes (the
                        // same format Android's MediaCodec produces). Rewrite
                        // each NAL as a 4-byte start code prefix.
                        var pos = 0
                        let raw = UnsafeRawPointer(dataPtr).bindMemory(to: UInt8.self, capacity: length)
                        while pos + 4 <= length {
                            let nalSize = Int(raw[pos]) << 24 | Int(raw[pos+1]) << 16 |
                                          Int(raw[pos+2]) << 8 | Int(raw[pos+3])
                            guard nalSize > 0, pos + 4 + nalSize <= length else { break }
                            ctx.data.append(contentsOf: [0, 0, 0, 1])
                            ctx.data.append(raw.advanced(by: pos + 4),
                                            count: nalSize)
                            pos += 4 + nalSize
                        }
                    }
                }
            },
            refcon: refPtr,
            compressionSessionOut: &session
        )
        guard status == noErr, let session = session else {
            return nil
        }

        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_ProfileLevel,
                             value: kVTProfileLevel_HEVC_Main_AutoLevel as CFTypeRef)
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_RealTime,
                             value: kCFBooleanTrue)
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_AllowFrameReordering,
                             value: kCFBooleanFalse)
        VTSessionSetProperty(session, key: kVTCompressionPropertyKey_MaxKeyFrameInterval,
                             value: 1 as CFTypeRef)

        guard VTCompressionSessionPrepareToEncodeFrames(session) == noErr else {
            VTCompressionSessionInvalidate(session)
            return nil
        }
        return EncoderSession(session: session, callback: ref, width: width, height: height)
    }

    /// All tiles remain independent keyframes, sharing one decoder configuration.
    static func encodeTile(yuv: Data, width: Int, height: Int, includeParameterSets: Bool = true) -> Data? {
        let frameSize = width * height
        let chromaSize = ((width + 1) / 2) * ((height + 1) / 2)
        guard width > 0, height > 0, yuv.count >= frameSize + 2 * chromaSize else { return nil }
        var encoder = Thread.current.threadDictionary[sessionKey] as? EncoderSession
        // The first tile marks a new Rust batch; never share hvcC across batches.
        if includeParameterSets || encoder?.width != width || encoder?.height != height {
            finishConversion()
            encoder = makeSession(width: width, height: height)
            if let encoder { Thread.current.threadDictionary[sessionKey] = encoder }
        }
        guard let encoder else { return nil }
        let session = encoder.session
        let ref = encoder.callback
        ref.data.removeAll(keepingCapacity: true)
        ref.includeParameterSets = includeParameterSets
        let w = Int32(width)
        let h = Int32(height)
        let chromaW = (width + 1) / 2
        let chromaH = (height + 1) / 2

        // Full-range (0–255) YUV, matching x265's "range full". Without this
        // VideoToolbox encodes limited range (420v), shifting decoded gain
        // values and making HDR brightness differ from the x265/Swift outputs.
        // Use the full-range biplanar pixel format so the encoder inherits it.
        let pbFormat = kCVPixelFormatType_420YpCbCr8BiPlanarFullRange

        var pixelBuffer: CVPixelBuffer?
        let attrs: [CFString: Any] = [
            kCVPixelBufferPixelFormatTypeKey: NSNumber(value: pbFormat),
            kCVPixelBufferWidthKey: NSNumber(value: w),
            kCVPixelBufferHeightKey: NSNumber(value: h),
            kCVPixelBufferPlaneAlignmentKey: 16 as CFNumber,
        ]
        let pbStatus = CVPixelBufferCreate(kCFAllocatorDefault, width, height,
                                           pbFormat,
                                           attrs as CFDictionary, &pixelBuffer)
        guard pbStatus == kCVReturnSuccess, let buffer = pixelBuffer else {
            finishConversion()
            return nil
        }

        // Match the x265 full-range BT.709 encoding so decoded gain values are
        // identical to the software path. Honors VideoToolbox's color-matrix
        // attachment on the source buffer.
        CVBufferSetAttachment(buffer, kCVImageBufferYCbCrMatrixKey,
                              kCVImageBufferYCbCrMatrix_ITU_R_709_2 as CFTypeRef,
                              .shouldPropagate)
        CVBufferSetAttachment(buffer, kCVImageBufferColorPrimariesKey,
                              kCVImageBufferColorPrimaries_ITU_R_709_2 as CFTypeRef,
                              .shouldPropagate)
        CVBufferSetAttachment(buffer, kCVImageBufferTransferFunctionKey,
                              kCVImageBufferTransferFunction_ITU_R_709_2 as CFTypeRef,
                              .shouldPropagate)

        CVPixelBufferLockBaseAddress(buffer, [])
        yuv.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            let src = raw.baseAddress!
            let planeCount = CVPixelBufferGetPlaneCount(buffer)
            if planeCount >= 3 {
                // Planar I420: Y, then U, then V.
                for plane in 0..<3 {
                    let dst = CVPixelBufferGetBaseAddressOfPlane(buffer, plane)!
                    let dstStride = CVPixelBufferGetBytesPerRowOfPlane(buffer, plane)
                    let srcPlane = src + (plane > 0 ? frameSize + (plane - 1) * chromaSize : 0)
                    let bytes = plane > 0 ? chromaSize : frameSize
                    let stride = plane > 0 ? chromaW : width
                    let rows = plane > 0 ? chromaH : height
                    if dstStride == stride {
                        memcpy(dst, srcPlane, bytes)
                    } else {
                        for row in 0..<rows {
                            memcpy(dst + row * dstStride, srcPlane + row * stride, stride)
                        }
                    }
                }
            } else {
                // Biplanar NV12 (full range): plane 0 = Y, plane 1 = interleaved
                // U/V. Convert packed I420 (Y,U,V) into NV12 (Y, U/V interleaved).
                let dstY = CVPixelBufferGetBaseAddressOfPlane(buffer, 0)!
                let yStride = CVPixelBufferGetBytesPerRowOfPlane(buffer, 0)
                let dstUV = CVPixelBufferGetBaseAddressOfPlane(buffer, 1)!
                let uvStride = CVPixelBufferGetBytesPerRowOfPlane(buffer, 1)
                // Copy Y.
                if yStride == width {
                    memcpy(dstY, src, frameSize)
                } else {
                    let srcY = src.assumingMemoryBound(to: UInt8.self)
                    let dstYRow = dstY.assumingMemoryBound(to: UInt8.self)
                    for row in 0..<height {
                        memcpy(dstYRow + row * yStride, srcY + row * width, width)
                    }
                }
                // Interleave U/V into NV12.
                let uSrc = (src + frameSize).assumingMemoryBound(to: UInt8.self)
                let vSrc = (src + frameSize + chromaSize).assumingMemoryBound(to: UInt8.self)
                let dstRowBase = dstUV.assumingMemoryBound(to: UInt8.self)
                for row in 0..<chromaH {
                    let dstRow = dstRowBase + row * uvStride
                    let uRow = uSrc + row * chromaW
                    let vRow = vSrc + row * chromaW
                    for col in 0..<chromaW {
                        dstRow[col * 2] = uRow[col]
                        dstRow[col * 2 + 1] = vRow[col]
                    }
                }
            }
        }
        CVPixelBufferUnlockBaseAddress(buffer, [])

        // Encode the frame as a keyframe.
        let pts = CMTime(value: encoder.frameIndex, timescale: 30)
        encoder.frameIndex += 1
        let encodeStatus = VTCompressionSessionEncodeFrame(
            session,
            imageBuffer: buffer,
            presentationTimeStamp: pts,
            duration: CMTime(value: 1, timescale: 30),
            frameProperties: [kVTEncodeFrameOptionKey_ForceKeyFrame: true] as CFDictionary,
            sourceFrameRefcon: nil,
            infoFlagsOut: nil
        )

        guard encodeStatus == noErr,
              VTCompressionSessionCompleteFrames(session, untilPresentationTimeStamp: .invalid) == noErr,
              !ref.data.isEmpty else {
            finishConversion()
            return nil
        }
        return ref.data
    }

    /// Convert a VideoToolbox hvcC decoder-config record (VPS/SPS/PPS NALs)
    /// into an Annex-B byte stream that Rust's hvcC extractor can parse.
    ///
    /// VideoToolbox's SampleDescriptionExtensionAtoms hvcC does not follow the
    /// standard HEVCDecoderConfigurationRecord layout (numOfArrays is zero);
    /// the VPS/SPS/PPS NALs are stored back-to-back after the header. We detect
    /// the 2-byte NAL headers (VPS=40 01, SPS=42 01, PPS=44 01) and emit them
    /// as an Annex-B stream.
    private static func hvccToAnnexB(_ hvcC: Data) -> Data {
        var out = Data()
        let vpsHeader: [UInt8] = [0x40, 0x01]
        let spsHeader: [UInt8] = [0x42, 0x01]
        let ppsHeader: [UInt8] = [0x44, 0x01]
        var positions: [(Int, [UInt8])] = []
        var i = 0
        while i + 1 < hvcC.count {
            let pair = [hvcC[i], hvcC[i + 1]]
            if pair == vpsHeader || pair == spsHeader || pair == ppsHeader {
                positions.append((i, pair))
                i += 2
                continue
            }
            i += 1
        }
        for (idx, (start, _)) in positions.enumerated() {
            let end = idx + 1 < positions.count ? positions[idx + 1].0 : hvcC.count
            out.append(contentsOf: [0, 0, 0, 1])
            out.append(hvcC[start..<end])
        }
        return out
    }
}

@_cdecl("komorebi_encode_hevc_tile")
func komorebiEncodeHEVCTile(
    pixels: UnsafePointer<UInt8>?,
    pixelsLength: Int,
    width: UInt32,
    height: UInt32,
    pixelBytes: Int,
    includeParameterSets: UInt8,
    output: UnsafeMutablePointer<UnsafeMutablePointer<UInt8>?>?,
    outputLength: UnsafeMutablePointer<Int>?
) -> Int32 {
    guard let pixels, let output, let outputLength else { return -1 }
    let source = Data(bytes: pixels, count: pixelsLength)
    guard let encoded = VideoToolboxHEVCEncoder.encodePixels(
        source,
        width: Int(width),
        height: Int(height),
        pixelBytes: pixelBytes,
        includeParameterSets: includeParameterSets != 0
    ), !encoded.isEmpty, let buffer = malloc(encoded.count) else { return -2 }
    encoded.copyBytes(to: buffer.assumingMemoryBound(to: UInt8.self), count: encoded.count)
    output.pointee = buffer.assumingMemoryBound(to: UInt8.self)
    outputLength.pointee = encoded.count
    return 0
}

@_cdecl("komorebi_free_hevc_tile")
func komorebiFreeHEVCTile(_ output: UnsafeMutablePointer<UInt8>?, _ outputLength: Int) {
    free(output)
}
