// ===============================
// 1. AOI: Jammu & Kashmir
// ===============================
var jk = geometry;
Map.centerObject(jk, 7);
Map.addLayer(jk, {color:'red', fillColor:'FF000055'}, 'J&K');

// ===============================
// 2. Rivers (HydroSHEDS)
// ===============================
var rivers = ee.FeatureCollection('WWF/HydroSHEDS/v1/FreeFlowingRivers')
                .filterBounds(jk);

var majorRivers = rivers.filter(ee.Filter.gte('ORD_FLOW', 5));
Map.addLayer(majorRivers, {color:'blue', width:2}, 'MajorRivers');

// ===============================
// 3. 500m Buffer
// ===============================
var riverBuffer = majorRivers.map(function(f){ return f.buffer(500); });
var riverZone = riverBuffer.union();
Map.addLayer(riverZone, {color:'orange'}, 'RiverBuffer');

// ===============================
// 4. Sentinel-2 Composite
// ===============================
var s2 = ee.ImageCollection('COPERNICUS/S2_SR')
  .filterBounds(jk)
  .filterDate('2023-01-01','2023-12-31')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',10))
  .select(['B2','B3','B4','B8']); 

var s2_median = s2.median();
Map.addLayer(s2_median,{bands:['B4','B3','B2'],min:0,max:3000},'S2_TC');

// ===============================
// 5. NDWI - Water Mask
// ===============================
var ndwi = s2_median.normalizedDifference(['B3','B8']);
var water = ndwi.gt(0.3).selfMask();
Map.addLayer(water,{palette:['0000FF']},'Water');

// Clip to river buffer
var waterNearRiver = water.clip(riverZone);
Map.addLayer(waterNearRiver,{palette:['00FFFF']},'WaterNearRiver');

// ===============================
// 6. NDVI - Vegetation Stress
// ===============================
var ndvi = s2_median.normalizedDifference(['B8','B4']);
var lowVeg = ndvi.lt(0.3).selfMask();
Map.addLayer(lowVeg,{palette:['FF9900']},'LowVeg');

// ===============================
// 7. Texture Roughness (GLCM)
// ===============================
// convert to 8-bit for GLCM
var gray = s2_median.select('B4').multiply(255/3000).toUint8();
var glcm = gray.glcmTexture({size:3});
var rough = glcm.select('B4_contrast'); // valid band name
Map.addLayer(rough,{min:0,max:5},'TextureRough');

// ===============================
// 8. Distance to rivers (Raster)
// ===============================
var riverRaster = ee.Image().byte().paint(majorRivers,1);
var dist = riverRaster.fastDistanceTransform(30).sqrt();
Map.addLayer(dist,{min:0,max:2000},'DistRiver');

// ===============================
// 9. Slope (Terrain)
// ===============================
var dem = ee.Image('USGS/SRTMGL1_003').clip(jk);
var slope = ee.Terrain.slope(dem);
Map.addLayer(slope,{min:0,max:60},'Slope');

// ===============================
// 10. Population Density
// ===============================
var pop = ee.ImageCollection('WorldPop/GP/100m/pop')
          .filterDate('2020-01-01','2020-12-31')
          .mean()
          .clip(jk);
Map.addLayer(pop,{min:0,max:2000,palette:['white','yellow','orange','red']},'Pop');

// Threshold high population near rivers
var popNearRiver = pop.updateMask(waterNearRiver); // raster mask
var highPop = popNearRiver.gt(500).selfMask();
Map.addLayer(highPop,{palette:['FF0000']},'HighPop');

// ===============================
// 11. Illegal Mining Risk Index
// ===============================
var risk = lowVeg
  .add(waterNearRiver.not())
  .add(rough.gt(2))
  .add(dist.lt(500))
  .add(highPop)
  .rename('RiskIndex');

Map.addLayer(risk,{min:0,max:5,palette:['white','yellow','red']},'RiskZones');

print('Pipeline executed successfully.');
