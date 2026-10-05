#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface XDRemuxBridge : NSObject
+ (BOOL)makeCompatibleFrom:(NSString *)inputPath
                        to:(NSString *)outputPath
                     error:(NSError * _Nullable * _Nullable)error;
+ (BOOL)addTextureStylesMetadata:(NSData *)metadata
                         toFile:(NSString *)path
                          error:(NSError * _Nullable * _Nullable)error;
+ (NSData * _Nullable)readStylesXMPFrom:(NSString *)path
                                error:(NSError * _Nullable * _Nullable)error;
+ (BOOL)writeStylesXMP:(NSData *)metadata
               toFile:(NSString *)path
                error:(NSError * _Nullable * _Nullable)error;
@end

NS_ASSUME_NONNULL_END
