// =====================================================================
// Fases del vuelo y checklists estilo Airbus A320 / A350 (Normal Checklist),
// en inglés como en cabina. {valores} se rellenan con los datos del vuelo:
// {fuel} {qnhDep} {qnhArr} {rwy} {sid} {fl} {destRwy} {star} {altn}
// side: 'dep' muestra frecuencias/ATIS/cartas de salida; 'arr' de llegada.
// =====================================================================
window.FLIGHT_PHASES = [
  {
    id: 'parking', name: 'Parking', side: 'dep', title: 'COCKPIT PREPARATION',
    tip: 'Avión frío y oscuro en el parking. Prepara la cabina, programa el MCDU con el OFP de SimBrief y pide la autorización a DEL.',
    items: [
      ['BATTERIES', 'ON'],
      ['EXTERNAL POWER', 'ON'],
      ['ADIRS', 'NAV'],
      ['APU', 'START'],
      ['GEAR PINS AND COVERS', 'REMOVED'],
      ['FUEL QUANTITY', '{fuel}'],
      ['MCDU', 'PROGRAMMED'],
      ['ATC CLEARANCE', 'RECEIVED'],
    ],
  },
  {
    id: 'before-start', name: 'Antes de arrancar', side: 'dep', title: 'BEFORE START',
    tip: 'Puertas cerradas y listo para el pushback. Pide pushback y arranque a GND.',
    items: [
      ['COCKPIT PREP', 'COMPLETED'],
      ['SIGNS', 'ON AUTO'],
      ['TAKEOFF DATA', 'SET'],
      ['BARO REF', '{qnhDep} SET'],
      ['WINDOWS AND DOORS', 'CLOSED'],
      ['BEACON', 'ON'],
      ['THRUST LEVERS', 'IDLE'],
      ['PARKING BRAKE', 'AS REQUIRED'],
    ],
  },
  {
    id: 'after-start', name: 'Arranque', side: 'dep', title: 'AFTER START',
    tip: 'Motores arrancados. Desconecta el APU bleed y pide rodaje.',
    items: [
      ['ANTI ICE', 'AS REQUIRED'],
      ['ECAM STATUS', 'CHECKED'],
      ['PITCH TRIM', 'SET'],
      ['RUDDER TRIM', 'ZERO'],
    ],
  },
  {
    id: 'taxi', name: 'Rodaje', side: 'dep', title: 'BEFORE TAKEOFF',
    tip: 'Rodando a la pista {rwy}. Revisa controles de vuelo y el briefing de salida ({sid}).',
    items: [
      ['FLIGHT CONTROLS', 'CHECKED'],
      ['FLIGHT INSTRUMENTS', 'CHECKED'],
      ['BRIEFING', 'CONFIRMED'],
      ['FLAP SETTING', 'CONF 1+F'],
      ['V SPEEDS AND FLEX TEMP', 'SET'],
      ['ATC', 'SET'],
      ['ECAM MEMO', 'TAKEOFF NO BLUE'],
    ],
  },
  {
    id: 'lineup', name: 'Alineado', side: 'dep', title: 'BEFORE TAKEOFF — BELOW THE LINE',
    tip: 'Autorizado a entrar en pista {rwy}. Luces, TCAS y transpondedor.',
    items: [
      ['TAKEOFF RUNWAY', '{rwy} CONFIRMED'],
      ['CABIN CREW', 'ADVISED'],
      ['TCAS', 'TA RA'],
      ['ENGINE MODE SELECTOR', 'AS REQUIRED'],
      ['PACKS', 'AS REQUIRED'],
      ['EXTERIOR LIGHTS', 'SET'],
    ],
  },
  {
    id: 'climb', name: 'Despegue y ascenso', side: 'dep', title: 'AFTER TAKEOFF / CLIMB',
    tip: 'Positive climb, gear up. Cambia a la frecuencia de salida y sigue la {sid}.',
    items: [
      ['LANDING GEAR', 'UP'],
      ['FLAPS', 'RETRACTED'],
      ['PACKS', 'ON'],
      ['BARO REF', 'STANDARD SET'],
    ],
  },
  {
    id: 'cruise', name: 'Crucero', side: 'arr', title: 'CRUISE',
    tip: 'Nivel de crucero FL{fl}. Revisa combustible, el ATIS de destino y prepara la llegada ({star}, pista {destRwy}).',
    items: [
      ['CRUISE ALTITUDE', 'FL{fl}'],
      ['FUEL', 'CHECKED'],
      ['DESTINATION ATIS', 'RECEIVED'],
      ['ARRIVAL', 'PROGRAMMED'],
      ['APPROACH BRIEFING', 'COMPLETED'],
    ],
  },
  {
    id: 'approach', name: 'Descenso y aproximación', side: 'arr', title: 'APPROACH',
    tip: 'Descenso hacia {destRwy}. Ajusta el QNH al cruzar el nivel de transición.',
    items: [
      ['BRIEFING', 'CONFIRMED'],
      ['ECAM STATUS', 'CHECKED'],
      ['SEAT BELTS', 'ON'],
      ['BARO REF', '{qnhArr} SET'],
      ['MINIMUMS', 'SET'],
      ['ENGINE MODE SELECTOR', 'AS REQUIRED'],
    ],
  },
  {
    id: 'landing', name: 'Aterrizaje', side: 'arr', title: 'LANDING',
    tip: 'Establecido en final a la pista {destRwy}. Tren abajo y full flaps.',
    items: [
      ['CABIN CREW', 'ADVISED'],
      ['AUTO THRUST', 'SPEED OR OFF'],
      ['LANDING GEAR', 'DOWN'],
      ['SPOILERS', 'ARMED'],
      ['FLAPS', 'FULL'],
      ['ECAM MEMO', 'LANDING NO BLUE'],
    ],
  },
  {
    id: 'after-landing', name: 'Tras aterrizar', side: 'arr', title: 'AFTER LANDING',
    tip: 'Pista libre. Pasa a GND y rueda al parking.',
    items: [
      ['FLAPS', 'RETRACTED'],
      ['SPOILERS', 'DISARMED'],
      ['APU', 'START'],
      ['RADAR', 'OFF'],
      ['STROBE LIGHTS', 'OFF'],
    ],
  },
  {
    id: 'parking-arr', name: 'Parking y apagado', side: 'arr', title: 'PARKING / SECURING',
    tip: 'En el stand. Apaga motores y asegura el avión.',
    items: [
      ['PARKING BRAKE', 'SET'],
      ['ENGINES', 'OFF'],
      ['SEAT BELTS', 'OFF'],
      ['BEACON', 'OFF'],
      ['FUEL PUMPS', 'OFF'],
      ['APU BLEED', 'AS REQUIRED'],
      ['BATTERIES', 'OFF'],
    ],
  },
];
