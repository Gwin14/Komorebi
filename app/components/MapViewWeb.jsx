import { WebView } from "react-native-webview";

export function MapViewWeb({ latitude, longitude }) {
  if (typeof latitude !== "number" || typeof longitude !== "number") {
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
            background: transparent;
          }

          #map{
            border-radius: 12px;
            }

            

          .leaflet-popup-content-wrapper {
            background: #020617;
            color: #e5e7eb;
            border-radius: 12px;
          }
          .leaflet-popup-tip {
            background: #020617;
          }
        </style>
      </head>

      <body>
        <div id="map"></div>

        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

        <script>
          document.addEventListener("DOMContentLoaded", function () {
            const map = L.map("map", { zoomControl: false }).setView(
              [${latitude}, ${longitude}],
              15
            );

            L.tileLayer(
              "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
              {
                maxZoom: 20,
                attribution: ""
              }
            ).addTo(map);

            const yellowIcon = L.icon({
              iconUrl: 'data:image/svg+xml;base64,' + btoa('<svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg"><path d="M12.5 0C5.596 0 0 5.596 0 12.5C0 21.875 12.5 41 12.5 41C12.5 41 25 21.875 25 12.5C25 5.596 19.404 0 12.5 0ZM12.5 18.75C9.048 18.75 6.25 15.952 6.25 12.5C6.25 9.048 9.048 6.25 12.5 6.25C15.952 6.25 18.75 9.048 18.75 12.5C18.75 15.952 15.952 18.75 12.5 18.75Z" fill="#ffaa00"/></svg>'),
              iconSize: [25, 41],
              iconAnchor: [12, 41],
              popupAnchor: [1, -34]
            });

            L.marker([${latitude}, ${longitude}], {
              icon: yellowIcon
            })
              .addTo(map)
              .bindPopup("<b>📍 Local da foto</b>");
          });
        </script>
      </body>
    </html>
  `;

  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html }}
      javaScriptEnabled
      domStorageEnabled
      style={{
        width: "100%",
        height: 250,
        borderRadius: 0,
        overflow: "hidden",
        backgroundColor: "transparent",
      }}
    />
  );
}
