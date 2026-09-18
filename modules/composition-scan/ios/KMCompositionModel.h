#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Small Objective-C++ boundary around llama.cpp's public multimodal API.
/// The implementation becomes a harmless stub when llama.xcframework has not
/// been prepared, so the regular Vision scan keeps building and working.
@interface KMCompositionModel : NSObject

+ (BOOL)isRuntimeAvailable;

- (nullable instancetype)initWithModelPath:(NSString *)modelPath
                                mmprojPath:(NSString *)mmprojPath
                                     error:(NSError * _Nullable * _Nullable)error;

- (nullable NSString *)analyzeImageAtPath:(NSString *)imagePath
                                    prompt:(NSString *)prompt
                                     error:(NSError * _Nullable * _Nullable)error;

@end

NS_ASSUME_NONNULL_END
