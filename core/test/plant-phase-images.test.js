const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { getPlantImageByPhase } = require('../src/config/gameConfig');

test('活动植物按阶段返回官方植物图片', () => {
    const image = getPlantImageByPhase(1021037, 6);
    assert.equal(image, '/game-config/plant_images/Crop_1037/6.png');
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'src', image.replace('/game-config/', 'gameConfig/'))), true);
});

test('2x2 Spine 活动植物可返回完整的静态阶段图', () => {
    assert.equal(getPlantImageByPhase(1029003, 1), '/game-config/plant_images/common/seed.png');
    for (let phase = 2; phase <= 7; phase += 1) {
        const image = getPlantImageByPhase(1029003, phase);
        assert.equal(image, `/game-config/plant_images/Crop_9003/${phase}.png`);
        assert.equal(fs.existsSync(path.join(__dirname, '..', 'src', image.replace('/game-config/', 'gameConfig/'))), true);
    }
});

test('所有作物的土地种子阶段共用客户端通用种子贴图', () => {
    const seedImage = '/game-config/plant_images/common/seed.png';
    assert.equal(getPlantImageByPhase(1020128, 1), seedImage);
    assert.equal(getPlantImageByPhase(1026032, 1), seedImage);
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'src', seedImage.replace('/game-config/', 'gameConfig/'))), true);
});
