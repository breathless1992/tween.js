'use strict';

// Demonstration colors only. Dxxx are internal demo IDs, never brand color numbers.
// Replace this literal list and metadata with a measured/licensed brand palette.
const HEX = [
  '#FFFFFF','#FAF8F4','#F2EEE7','#E9E4DB','#DCD6CC','#CDC6BC','#B8B2A9','#99958E',
  '#E8E8E8','#D0D0D0','#B2B2B2','#909090','#707070','#505050','#303030','#141414',
  '#F8E8D0','#EED9B9','#DFCAA8','#CEB58F','#B89D77','#A08866','#887255','#6B5945',
  '#E6C9AC','#D1AE8E','#B99274','#A17A61','#89634E','#704F40','#573C31','#3B2923',
  '#EEE2DB','#D8C5BF','#BFAAA6','#A58F8D','#8D7575','#745E60','#59484D','#3F343C',
  '#F5D7DC','#E8B9C5','#D799AF','#BD7894','#A45A7F','#874765','#663651','#44263B',
  '#EBB4A7','#D49385','#B8796C','#A15E53','#89463D','#71332E','#562522','#371B1A',
  '#EFF4F7','#DCE5EB','#C2D0DC','#A5B9CA','#879EB3','#6C849A','#536B82','#3D5065',
  '#CBDCE9','#A6C6DE','#7BABD0','#4C90BE','#286F9F','#20547C','#1A3C5C','#172B43',
  '#E7EBE1','#CFD7C5','#B0BFA7','#91A58A','#73896C','#58714F','#40553B','#2B3C29',
  '#F8EDBC','#EFD990','#E4BF61','#D2A13D','#B5822B','#926326','#6F4923','#4A321F',
  '#ECDDEC','#D3BEDB','#B69CC7','#947AAB','#765D91','#5B4673','#423354','#2D243A',
  '#F7D9B9','#ECB985','#DC9558','#C67437','#A95629','#894028','#653024','#44241E'
];
const palette = HEX.map((hex, i) => ({ code: 'D' + String(i + 1).padStart(3, '0'), hex }));
const metadata = { name: '演示色卡', isDemo: true, description: 'D 色号仅为演示编号，不对应任何品牌；实际制作前须替换为真实品牌色卡。' };
module.exports = { palette, metadata };
