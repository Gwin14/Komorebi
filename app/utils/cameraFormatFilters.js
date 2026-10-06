function getCameraFormatFilters({
  sensorAspectRatio,
  rawPhotoMode,
  manualPhotoMode,
  frameProcessorActive,
}) {
  return [
    { photoAspectRatio: rawPhotoMode ? 4 / 3 : sensorAspectRatio },
    // Some lenses expose RAW only on the full-resolution session format.
    // Limit RAW to 12 MP in AVCapturePhotoSettings, not by changing that format.
    ...(rawPhotoMode || (!manualPhotoMode && !frameProcessorActive)
      ? [{ photoResolution: "max" }]
      : []),
    // The preview uses the video stream, whose ratio can differ from the photo.
    // Prefer a matching stream before its resolution to avoid an extra crop.
    { videoAspectRatio: sensorAspectRatio },
    {
      videoResolution: frameProcessorActive
        ? { width: 1080, height: 720 }
        : "max",
    },
  ];
}

module.exports = { getCameraFormatFilters };
