export const parseCubeFile = (text) => {
  const lines = text.split("\n");
  let size = 0;
  let domainMin = [0, 0, 0];
  let domainMax = [1, 1, 1];
  const lut = [];

  for (let line of lines) {
    line = line.trim();

    if (line.startsWith("LUT_3D_SIZE")) {
      size = parseInt(line.split(/\s+/)[1]);
    } else if (line.startsWith("DOMAIN_MIN")) {
      const values = line.split(/\s+/).slice(1);
      domainMin = [
        parseFloat(values[0]),
        parseFloat(values[1]),
        parseFloat(values[2]),
      ];
    } else if (line.startsWith("DOMAIN_MAX")) {
      const values = line.split(/\s+/).slice(1);
      domainMax = [
        parseFloat(values[0]),
        parseFloat(values[1]),
        parseFloat(values[2]),
      ];
    } else if (
      !line.startsWith("#") &&
      line !== "" &&
      !line.startsWith("LUT_") &&
      !line.startsWith("DOMAIN") &&
      !line.startsWith("TITLE")
    ) {
      const values = line.split(/\s+/).filter((v) => v !== "");
      if (values.length === 3) {
        lut.push({
          r: parseFloat(values[0]),
          g: parseFloat(values[1]),
          b: parseFloat(values[2]),
        });
      }
    }
  }

  return { size, lut, domainMin, domainMax };
};
