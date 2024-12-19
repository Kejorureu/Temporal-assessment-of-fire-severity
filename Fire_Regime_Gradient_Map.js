// Fire Regime Gradient Map

// Database - SENTINEL 2
// Temporal assessment of fire severity  a case study in Brazilian savannas
// kejorureu@gmail.com
// https://www.ufrgs.br/bimalab/
// Remote Scripts

// Defining the region of interest
var region = ee.FeatureCollection('users/cintiafc04/MAPBIOMAS/UCs');
// Create an empty image to paint the features, converted to byte.
var empty = ee.Image().byte();
// Paint all edges of the polygon with the same number and width, display it.
var contour = empty.paint({
  featureCollection: region,
  color: 1,
  width: 1
});
// Centering analysis on the same region
Map.centerObject(region);

// Function to calculate NBR
// 'NIR' (B8) and 'SWIR-2' (B12)
var addNBR = function(image) {
  var nbr = image.normalizedDifference(['B8', 'B12']).rename(['nbr']);
  return image.multiply(0.0001).addBands(nbr).clip(region).copyProperties(image, image.propertyNames())
        .set({date: image.date().format('YYYY-MM-dd')});
};

// Function for cloud mask
function maskCloudAndShadowsSR(image) {
  var cloudProb = image.select('MSK_CLDPRB');
  var snowProb = image.select('MSK_SNWPRB');
  var cloud = cloudProb.lt(5);
  var snow = snowProb.lt(5);
  var scl = image.select('SCL'); 
  var shadow = scl.eq(3); // 3 = cloud shadow
  var cirrus = scl.eq(10); // 10 = cirrus
  // Cloud probability less than 5% or cloud shadow classification
  var mask = (cloud.and(snow)).and(cirrus.neq(1)).and(shadow.neq(1));
  return image.updateMask(mask);
}

// As our image is in more than one orbit/path,
// we need to mosaic the data.
function mosaicByDate(imcol) {
  // imcol: An image collection
  // returns: An image collection
  var imlist = imcol.toList(imcol.size());

  var unique_dates = imlist.map(function(im) {
    return ee.Image(im).date().format("YYYY-MM-dd");
  }).distinct();

  var mosaic_imlist = unique_dates.map(function(d) {
    d = ee.Date(d);

    var im = imcol
      .filterDate(d, d.advance(1, "day"))
      .mosaic();

    return im.set(
        "system:time_start", d.millis(), 
        "system:id", d.format("YYYY-MM-dd"));
  });

  return ee.ImageCollection(mosaic_imlist);
}

// Collection
var sentinel_2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                          .filterDate('2017-03-28','2023-01-01')
                          .filterBounds(region)
                          .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE',10));

// Create mosaic
var mosaic_collection = mosaicByDate(sentinel_2)
                          .map(maskCloudAndShadowsSR)
                          .select(['B.*'])
                          .map(addNBR);

print('Image count after mosaicking', mosaic_collection.size());

//------------------Reducing data to monthly intervals--------------------//
// Define the time range
var startyear = 2019;
var endyear = 2023;

// Create a sequential list for years
var years = ee.List.sequence(startyear, endyear);

// Create a sequential list for months
var months = ee.List.sequence(1, 12);

// Define start and end dates
var startdate = ee.Date.fromYMD(startyear, 1, 1);
var enddate = ee.Date.fromYMD(endyear, 12, 31);

// Calculate the monthly NBR
var nbr_month = ee.ImageCollection.fromImages(
  years.map(function (y) { 
    return months.map(function(m) { 
      var nbr_month_ = mosaic_collection.select(['nbr','B11','B8','B4','B3','B2'])
                    .filter(ee.Filter.calendarRange(y, y, 'year'))
                    .filter(ee.Filter.calendarRange(m, m, 'month'))
                    .median();
      return nbr_month_.set('year', y)
              .set('month', m)
              .set('system:time_start', ee.Date.fromYMD(y, m, 1));
    });
  }).flatten()
);

print('Monthly collection', nbr_month);

// Display dates with the highest NBR values
var chartMedianComp = ui.Chart.image.seriesByRegion({
                            imageCollection: nbr_month,
                            regions: region,
                            reducer: ee.Reducer.median(),
                            scale: 30,
                            xProperty: 'system:time_start',
                            seriesProperty: 'NOME_UC1'
                          })
                          .setSeriesNames(['RPNN', 'APA'])
                          .setOptions({
                            title: 'Intra-annual Median',
                            colors: ['619cff', '#d63778'],
                            hAxis: {title: 'Date'},
                            vAxis: {title: 'NBR'},
                            lineWidth: 3,
                            dataOpacity: 0.5
                          });
print(chartMedianComp);

// Create Before and After composites
var before = nbr_month.max();
var after = nbr_month.min();

var beforeNbr = nbr_month.select('nbr').max();
var afterNbr = nbr_month.select('nbr').min();

// Visualizing data
var nbrVis = {min: 0.2, max: 0.8, palette: ['#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026']};

// Add layers to map
Map.addLayer(beforeNbr, nbrVis, 'Prefire NBR');
Map.addLayer(before, {bands: ['B4', 'B3', 'B2'], min: 0.019, max: 0.19}, 'Prefire');
Map.addLayer(afterNbr, nbrVis, 'Postfire NBR'); 
Map.addLayer(after, {bands: ['B4', 'B3', 'B2'], min: 0.019, max: 0.19}, 'Postfire');  
Map.addLayer(contour, {}, 'Region Boundary');

// USGS Burn Severity Classification
// | Severity     | dNBR Range         | Class |
// |--------------|--------------------|-------|
// | Unburned     | < 0.1              | 0     |
// | Low Severity | >= 0.10 and <0.27  | 1     |
// | Moderate-Low | >= 0.27 and <0.44  | 2     |
// | Moderate-High| >= 0.44 and< 0.66  | 3     |
// | High         | >= 0.66            | 4     |

// Calculate change in NBR (dNBR)
var change = beforeNbr.subtract(afterNbr);

// Classify continuous values using .where()
var severity = change
  .where(change.lt(0), 1)
  .where(change.gte(0).and(change.lt(0.10)), 2)
  .where(change.gte(0.10).and(change.lt(0.27)), 3)
  .where(change.gte(0.27).and(change.lt(0.44)), 4)
  .where(change.gte(0.44).and(change.lt(0.66)), 5)
  .where(change.gt(0.66), 6).int();

// | Severity     | Class | Color   |
// |--------------|-------|---------|
// | Unburned     | 0     | green   |
// | Low Severity | 1     | yellow  |
// | Moderate-Low | 2     | orange  |
// | Moderate-High| 3     | red     |
// | High         | 4     | magenta |
var palette = ['white', 'darkgreen', 'yellow', 'orange', 'red', 'magenta'];
Map.addLayer(severity, {min: 1, max: 6, palette: palette}, 'Burn Severity');

// Add legend
var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px 15px'
  }
});

var legendTitle = ui.Label({
  value: 'dNBR Classes',
  style: {fontWeight: 'bold', fontSize: '18px', margin: '0 0 4px 0', padding: '0'}
});

legend.add(legendTitle);

var makeRow = function(color, name) {
  var colorBox = ui.Label({
    style: {backgroundColor: '#' + color, padding: '8px', margin: '0 0 4px 0'}
  });
  var description = ui.Label({
    value: name,
    style: {margin: '0 0 4px 6px'}
  });
  return ui.Panel({widgets: [colorBox, description], layout: ui.Panel.Layout.Flow('horizontal')});
};

var palette = ['ffffff', '0ae042', 'fff70b', 'ffaf38', 'ff641b', 'a41fd6'];
var names = ['NA', 'Unburned', 'Low Severity', 'Moderate-Low', 'Moderate-High', 'High'];

for (var i = 0; i < 6; i++) {
  legend.add(makeRow(palette[i], names[i]));
}

Map.add(legend);

// Export images
Export.image.toDrive({
  image: severity, 
  description: 'NBR', 
  folder: 'CINTIA', 
  fileNamePrefix: 'NBR', 
  region: region, 
  scale: 30, 
  crs: 'EPSG:4674',
  maxPixels: 1e13,
  fileDimensions: 4000
});

Export.image.toDrive({
  image: change,
  description: 'Change',
  folder: 'CINTIA',
  fileNamePrefix: 'CHANGE',
  region: region,
  scale: 30,
  crs: 'EPSG:4674',
  maxPixels: 1e13,
  fileDimensions: 4000
});
