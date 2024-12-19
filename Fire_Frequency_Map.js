// Fire Frequency Map

// Database - MapBiomas
// https://brasil.mapbiomas.org/colecoes-mapbiomas/
// Temporal assessment of fire severity  a case study in Brazilian savannas
// kejorureu@gmail.com
// https://www.ufrgs.br/bimalab/
// Remote Scripts

//Defining the region of interest
var region = ee.FeatureCollection('users/cintiafc04/MAPBIOMAS/UCs')

//Create an empty image to paint the resources, converted into bytes
var empty = ee.Image().byte();

//Paint all the edges of the polygon with the same number and width, then display
var contorno = empty.paint({
  featureCollection:region ,
  color: 1,
  width: 1
});

//Centering analysis on the same region
Map.centerObject(region)

//Defining the image collection
var annual_burned_coverage = ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection3/mapbiomas_fire_collection3_annual_burned_coverage_v1')
var fire_frequency= ee.Image('projects/mapbiomas-public/assets/brazil/fire/collection3/mapbiomas_fire_collection3_fire_frequency_v1')

//Defining the list of image bands
var lista_de_bandas = ee.List(fire_frequency.bandNames())
print('Lista de Bandas Fire Frequency',lista_de_bandas)

//Selecting my annual data
var fire_frequency_1985_2020= fire_frequency.select('fire_frequency_1985_2020').clip(region).divide(100).int()


//Adding layers
Map.addLayer(fire_frequency_1985_2020, {palette:['#ffffff','#f8d71f', '#daa118','#bd6c12','#9f360b','#810004','#4d0709'
            ], min:1, max:36}, 'Frequencia 1985-2020')
Map.addLayer(contorno, {},'RPPN e APA')

//Categorization of the SRTM image using expression
var fire_frequency_1985_2020_reclass = ee.Image(1)
       .where(fire_frequency_1985_2020.eq(0).and(fire_frequency_1985_2020.lt(1)), 1) //sem registro
       .where(fire_frequency_1985_2020.gt(0).and(fire_frequency_1985_2020.lte(2)), 2) //baixa
       .where(fire_frequency_1985_2020.gt(2).and(fire_frequency_1985_2020.lte(4)), 3) //média
       .where(fire_frequency_1985_2020.gt(4).and(fire_frequency_1985_2020.lte(10)), 4) //média-alta
       .where(fire_frequency_1985_2020.gt(10).and(fire_frequency_1985_2020.lte(15)), 5)//Alta
       .where(fire_frequency_1985_2020.gt(15).and(fire_frequency_1985_2020.lte(36)), 6) //Severa
        .clip(region)

                  

//Adding layers
Map.addLayer(fire_frequency_1985_2020_reclass, {"bands":["constant"],
                                                "palette":["ffffff","0ef100","f6ff7e","f7b857","ff0000","c40000"],'min':1, 'max':6},
                                                'reclass');
                                                
//Export images
Export.image.toDrive({image:fire_frequency_1985_2020_reclass, 
                    description:'fire_frequency_mapbiomas', 
                    folder:'CINTIA', 
                    fileNamePrefix:'fire_frequency_mapbiomas', 
                    region:region, 
                    scale:30, 
                    crs: 'EPSG:4674',
                    maxPixels:1e13,
                    fileFormat:'GeoTIFF'})