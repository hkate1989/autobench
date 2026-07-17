export const tasks = {
  moonLandings: { id:"apollo_moon_landings", prompt:"Which Apollo missions successfully landed astronauts on the Moon?", directQuery:"Apollo missions successfully landed astronauts on the Moon", discoveryQuery:"Apollo missions list", verifyPhrase:/landed|lunar landing|moon landing/i, groundTruth:["Apollo 11","Apollo 12","Apollo 14","Apollo 15","Apollo 16","Apollo 17"] },
  lunarRover: { id:"apollo_lunar_roving_vehicle", prompt:"Which Apollo missions carried the Lunar Roving Vehicle?", directQuery:"Apollo missions carried Lunar Roving Vehicle", discoveryQuery:"Apollo missions list", verifyPhrase:/lunar roving vehicle|lunar rover|LRV/i, groundTruth:["Apollo 15","Apollo 16","Apollo 17"] }
};
export const missionTitles = text => [...new Set([...text.matchAll(/\bApollo\s+(?:1[0-7]|[7-9])\b/gi)].map(m=>`Apollo ${m[0].match(/\d+/)[0]}`))];
