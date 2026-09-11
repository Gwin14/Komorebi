#import <VisionCamera/FrameProcessorPlugin.h>
#import <VisionCamera/FrameProcessorPluginRegistry.h>
#if __has_include(<CompositionScan/CompositionScan-Swift.h>)
#import <CompositionScan/CompositionScan-Swift.h>
#else
#import "CompositionScan-Swift.h"
#endif

VISION_EXPORT_SWIFT_FRAME_PROCESSOR(CompositionScanPlugin, captureCompositionFrame)
