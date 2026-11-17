# Despacho VATSIM

Planificador de vuelos para MSFS 2024 + VATSIM, de uso personal y recreativo (no comercial).

Asistente en 5 pasos:
1. **Ruta**: mapa con el ATC de VATSIM en directo (FIRs, torres, aproximaciones, ATIS), búsqueda de origen/destino o propuesta de la IA según el ATC conectado y cuánto le queda.
2. **Avión**: familias A320 y A350 primero, con fotos reales y los que operan la ruta en la vida real.
3. **Aerolínea**: compañías que operan ese avión o esa ruta, con logo y foto de su librea.
4. **Despacho**: número de vuelo en el rango real de la aerolínea, pistas en uso (ATIS de VATSIM o viento del METAR), nivel con regla semicircular, alternativo, pax y briefing por IA (DeepSeek).
5. **Envío**: abre SimBrief con todo relleno, detecta el OFP generado, enlaza a la presentación del plan en VATSIM y lo guarda en el historial (Firebase o local). Botón para ejecutar `iniciar_vuelo.bat`.

## Arrancar
Doble clic en `abrir_despacho.bat` (necesita Node.js 22+). Abre http://localhost:5757.

La primera vez se crea `config.json`. Rellena en **Ajustes**: usuario de SimBrief, clave de DeepSeek y (opcional) Firebase.

## Firebase (opcional)
1. Crea un proyecto en https://console.firebase.google.com
2. Crea una base de datos **Firestore** (modo de prueba, o reglas que permitan leer/escribir la colección `flights`).
3. En Configuración del proyecto → General, copia el **Project ID** y la **Web API Key** en Ajustes.

## Fuentes de datos
- VATSIM data feed, ATC bookings y events API
- Rutas actuales: [Jonty/airline-route-data](https://github.com/Jonty/airline-route-data)
- Aeropuertos y aerolíneas: OpenFlights · Pistas: OurAirports · FIRs: VATSpy data project
- METAR/TAF: aviationweather.gov
- Fotos: Wikimedia Commons (se muestran con autor y licencia, se cargan en directo)
- Logos: pics.avs.io (se cargan en directo, no se guardan en el repositorio)
- Flotas (`data/fleets.json`): base curada a mano, centrada en Europa
