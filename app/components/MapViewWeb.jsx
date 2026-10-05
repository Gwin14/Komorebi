import { WebView } from "react-native-webview";
import styles from "./MapViewWeb.styles";

export function MapViewWeb({ latitude, longitude }) {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />

        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        />

        <style>
          html, body, #map, .leaflet-container {
            height: 100%;
            margin: 0;
            padding: 0;
            background: #080808;
          }

          #map {
            border-radius: 12px;
          }

          .leaflet-tile-pane {
            filter: grayscale(1) invert(1) brightness(0.65) contrast(0.9);
          }

          .photo-location {
            box-sizing: border-box;
            border: 2px solid #ffaa00;
            border-radius: 50%;
            background: #ffaa00;
            box-shadow: 0 0 0 6px rgba(255, 170, 0, 0.12), 0 2px 8px #000;
          }

          .leaflet-control-attribution {
            background: rgba(8, 8, 8, 0.85) !important;
            color: #999;
            font-size: 9px;
          }
          .leaflet-control-attribution a {
            color: #aaa;
          }

          .leaflet-popup-content-wrapper {
            background: #111111;
            color: #e5e5e5;
            border-radius: 12px;
          }
          .leaflet-popup-tip {
            background: #111111;
          }
        </style>
      </head>

      <body>
        <div id="map"></div>

        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

        <script>
          document.addEventListener("DOMContentLoaded", function () {
            const map = L.map("map", { zoomControl: false, attributionControl: true }).setView(
              [${latitude}, ${longitude}],
              15
            );

            L.tileLayer(
              "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
              {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              }
            ).addTo(map);

            const locationIcon = L.divIcon({
              className: "photo-location",
              iconSize: [12, 12],
              iconAnchor: [6, 6],
              popupAnchor: [0, -12]
            });

            L.marker([${latitude}, ${longitude}], {
              icon: locationIcon
            })
              .addTo(map)
              .bindPopup("Local da foto");
          });
        </script>
      </body>
    </html>
  `;

  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html }}
      applicationNameForUserAgent="Komorebi (+https://github.com/Gwin14/Komorebi)"
      cacheEnabled
      javaScriptEnabled
      domStorageEnabled
      style={styles.webView}
    />
  );
}
