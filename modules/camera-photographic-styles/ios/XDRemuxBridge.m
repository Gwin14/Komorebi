#import "XDRemuxBridge.h"
#include <stdbool.h>
#include <stdint.h>

typedef struct {
  uint8_t oppo_compat;
  uint8_t oppo_camera_tail;
  uint8_t strict_tmap;
  uint8_t apple_photographic_styles;
  uint8_t apple_portrait;
} XDConvertConfig;

typedef struct {
  bool success;
  char *mode;
  char *family;
  double edr_scale;
  double gain_map_max;
  char *error_message;
} XDConversionResult;

extern XDConversionResult xdremux_convert(
  const char *input_path,
  const char *output_path,
  const XDConvertConfig *config
);
extern bool xdremux_verify_styles_output(const char *path);
extern void xdremux_free_result(XDConversionResult result);

@implementation XDRemuxBridge

+ (BOOL)makeCompatibleFrom:(NSString *)inputPath
                        to:(NSString *)outputPath
                     error:(NSError **)error {
  XDConvertConfig config = { 0, 255, 0, 1, 0 };
  XDConversionResult result = xdremux_convert(
    inputPath.fileSystemRepresentation,
    outputPath.fileSystemRepresentation,
    &config
  );

  BOOL converted = result.success;
  NSString *message = result.error_message
    ? [NSString stringWithUTF8String:result.error_message]
    : @"Falha ao gerar o HEIF compatível com Estilos Fotográficos.";
  xdremux_free_result(result);

  BOOL verified = converted && xdremux_verify_styles_output(outputPath.fileSystemRepresentation);
  if (!verified && error) {
    *error = [NSError errorWithDomain:@"CameraPhotographicStyles"
                                 code:converted ? 2 : 1
                             userInfo:@{NSLocalizedDescriptionKey: message}];
  }
  return verified;
}

@end
