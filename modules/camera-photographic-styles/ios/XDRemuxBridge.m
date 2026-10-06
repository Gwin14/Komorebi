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
extern char *xdremux_inject_texture_styles_metadata_result(
  const char *input_path,
  const char *output_path,
  const uint8_t *payload,
  size_t payload_len
);
extern void xdremux_free_result(XDConversionResult result);
extern void xdremux_free_string(char *value);
extern char *xdremux_read_styles_xmp(const char *path);
extern char *xdremux_write_styles_xmp(const char *path, const uint8_t *payload, size_t length);

@implementation XDRemuxBridge

+ (NSData *)readStylesXMPFrom:(NSString *)path error:(NSError **)error {
  char *packet = xdremux_read_styles_xmp(path.fileSystemRepresentation);
  NSData *data = packet
    ? [[NSString stringWithUTF8String:packet] dataUsingEncoding:NSUTF8StringEncoding] : nil;
  if (packet) xdremux_free_string(packet);
  if (!data && error) {
    *error = [NSError errorWithDomain:@"CameraPhotographicStyles" code:5
      userInfo:@{NSLocalizedDescriptionKey: @"O catálogo HDR da foto não pôde ser lido."}];
  }
  return data;
}

+ (BOOL)writeStylesXMP:(NSData *)metadata toFile:(NSString *)path error:(NSError **)error {
  char *result = xdremux_write_styles_xmp(path.fileSystemRepresentation, metadata.bytes, metadata.length);
  NSDictionary *diagnostic = nil;
  if (result) {
    NSData *data = [[NSString stringWithUTF8String:result] dataUsingEncoding:NSUTF8StringEncoding];
    if (data) diagnostic = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    xdremux_free_string(result);
  }
  BOOL success = [diagnostic[@"success"] boolValue];
  if (!success) {
    NSString *detail = diagnostic[@"errorMessage"] ?: @"sem diagnóstico nativo";
    NSLog(@"[CameraPhotographicStyles] Catalog XMP update failed: %@", detail);
    if (error) *error = [NSError errorWithDomain:@"CameraPhotographicStyles" code:6
      userInfo:@{NSLocalizedDescriptionKey: [@"Não foi possível preservar o catálogo da foto: " stringByAppendingString:detail]}];
  }
  return success;
}

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
  if (converted && !verified) {
    message = @"O HEIF não passou na validação dos Estilos Fotográficos.";
  }
  if (!verified && error) {
    *error = [NSError errorWithDomain:@"CameraPhotographicStyles"
                                 code:converted ? 2 : 1
                             userInfo:@{NSLocalizedDescriptionKey: message}];
  }
  return verified;
}

+ (BOOL)addTextureStylesMetadata:(NSData *)metadata
                         toFile:(NSString *)path
                          error:(NSError **)error {
  BOOL baseVerified = xdremux_verify_styles_output(path.fileSystemRepresentation);
  NSString *message = nil;
  if (!baseVerified) {
    message = @"Os Estilos Fotográficos atuais não foram preservados ao gravar os metadados.";
  } else {
    char *result = xdremux_inject_texture_styles_metadata_result(
      path.fileSystemRepresentation, path.fileSystemRepresentation,
      metadata.bytes, metadata.length
    );
    NSDictionary *diagnostic = nil;
    if (result) {
      NSData *data = [[NSString stringWithUTF8String:result] dataUsingEncoding:NSUTF8StringEncoding];
      if (data) diagnostic = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
      xdremux_free_string(result);
    }
    if (![diagnostic[@"success"] boolValue]) {
      NSString *detail = diagnostic[@"errorMessage"] ?: @"sem diagnóstico nativo";
      NSLog(@"[CameraPhotographicStyles] Texture insertion failed: %@", detail);
      message = [@"Não foi possível adicionar Estilos Fotográficos 3: " stringByAppendingString:detail];
    } else if (!xdremux_verify_styles_output(path.fileSystemRepresentation)) {
      message = @"Os Estilos Fotográficos atuais não foram preservados após adicionar a versão 3.";
    }
  }
  BOOL verified = message == nil;
  if (!verified) {
    NSLog(@"[CameraPhotographicStyles] %@", message);
    if (error) {
      *error = [NSError errorWithDomain:@"CameraPhotographicStyles" code:baseVerified ? 3 : 4
        userInfo:@{NSLocalizedDescriptionKey: message}];
    }
  }
  return verified;
}

@end
