import Foundation

func nalUnits(_ data: Data) -> [Data] {
    let bytes = [UInt8](data)
    var starts: [Int] = []
    for index in 0..<max(0, bytes.count - 3) {
        if Array(bytes[index..<(index + 4)]) == [0, 0, 0, 1] { starts.append(index) }
    }
    return starts.enumerated().map { index, start in
        data[(start + 4)..<(index + 1 < starts.count ? starts[index + 1] : data.count)]
    }
}

@main
struct Check {
    static func main() throws {
        guard VideoToolboxHEVCEncoder.isSupported else {
            fatalError("HEVC encoder unavailable on this machine")
        }
        let output = URL(fileURLWithPath: CommandLine.arguments[1])
        let count = 24
        for reuse in [false, true] {
            let started = Date()
            var stream = Data()
            var headers = Data()
            defer { VideoToolboxHEVCEncoder.finishConversion() }
            for index in 0..<count {
                let pixels = Data(repeating: UInt8(16 + index * 9), count: 512 * 512)
                guard let encoded = VideoToolboxHEVCEncoder.encodePixels(
                    pixels, width: 512, height: 512, pixelBytes: 1,
                    includeParameterSets: !reuse || index == 0
                ) else { fatalError("Tile \(index) failed") }
                let units = nalUnits(encoded)
                let types = units.map { ($0.first! >> 1) & 0x3f }
                precondition(types.contains(19) || types.contains(20), "Every tile must be an independent IDR")
                if !reuse || index == 0 {
                    for type: UInt8 in [32, 33, 34] {
                        precondition(types.contains(type), "Missing parameter set \(type)")
                    }
                } else {
                    precondition(!types.contains(32) && !types.contains(33) && !types.contains(34))
                }
                if index == 0 {
                    for unit in units where [32, 33, 34].contains((unit.first! >> 1) & 0x3f) {
                        headers.append(contentsOf: [0, 0, 0, 1])
                        headers.append(unit)
                    }
                }
                stream.append(encoded)
                if reuse && index == count - 1 {
                    // Decode the last tile by itself using only the first tile's
                    // parameter sets, as HEIF's independently addressed tiles do.
                    var independent = headers
                    independent.append(encoded)
                    try independent.write(to: output.appendingPathComponent("independent.hevc"))
                }
            }
            let name = reuse ? "reused" : "fresh"
            let elapsed = Date().timeIntervalSince(started)
            try stream.write(to: output.appendingPathComponent("\(name).hevc"))
            print("\(name): \(count) tiles in \(String(format: "%.3f", elapsed))s")
            VideoToolboxHEVCEncoder.finishConversion()
        }
        // Exercise dimension changes and RGB conversion in a separate batch.
        defer { VideoToolboxHEVCEncoder.finishConversion() }
        for size in [64, 128] {
            precondition(VideoToolboxHEVCEncoder.encodePixels(
                Data(repeating: 100, count: size * size * 3), width: size, height: size,
                pixelBytes: 3, includeParameterSets: true
            ) != nil)
        }
        precondition(VideoToolboxHEVCEncoder.encodePixels(
            Data(), width: 64, height: 64, pixelBytes: 1, includeParameterSets: true
        ) == nil)
        print("HEVC batch, keyframe, dimensions, RGB and invalid-input checks passed")
    }
}
