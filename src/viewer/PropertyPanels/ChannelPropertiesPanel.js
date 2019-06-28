

import {Utils} from "../../utils.js";
import {PointCloudTree} from "../../PointCloudTree.js";
import {Measure} from "../../utils/Measure.js";
import {Profile} from "../../utils/Profile.js";
import {Volume, BoxVolume, SphereVolume} from "../../utils/Volume.js";
import {PointSizeType, PointShape} from "../../defines.js";
import {Gradients} from "../../materials/Gradients.js";

import {MeasurePanel} from "./MeasurePanel.js";
import {DistancePanel} from "./DistancePanel.js";
import {PointPanel} from "./PointPanel.js";
import {AreaPanel} from "./AreaPanel.js";
import {AnglePanel} from "./AnglePanel.js";
import {HeightPanel} from "./HeightPanel.js";
import {VolumePanel} from "./VolumePanel.js";
import {ProfilePanel} from "./ProfilePanel.js";
import {CameraPanel} from "./CameraPanel.js";

export class ChannelPropertiesPanel{
	
	constructor(container, viewer){
		this.container = container;
		this.viewer = viewer;
		this.object = null;
		this.cleanupTasks = [];
		this.scene = null;
	}
	
	setScene(scene){
		this.scene = scene;
	}
	
	set(object){
		if(this.object === object){
			return;
		}
		
		this.object = object;
		
		for(let task of this.cleanupTasks){
			task();
		}
		this.cleanupTasks = [];
		this.container.empty();
		
		if(object instanceof PointCloudTree){
			this.setPointCloud(object);
		}else if(object instanceof Measure || object instanceof Profile || object instanceof Volume){
			this.setMeasurement(object);
		}else if(object instanceof THREE.Camera){
			this.setCamera(object);
		}
		
	}
	
	//
	// Used for events that should be removed when the property object changes.
	// This is for listening to materials, scene, point clouds, etc.
	// not required for DOM listeners, since they are automatically cleared by removing the DOM subtree.
	//
	addVolatileListener(target, type, callback){
		target.addEventListener(type, callback);
		this.cleanupTasks.push(() => {
			target.removeEventListener(type, callback);
		});
	}
	
	setPointClouds(pointclouds){
		
		let panel = $(`
            <div class="scene_content selectable">
                <div id="channel-settings"></div>
            </div>
        `);

	    let initChannelSettings = function(material, i, name) {
			let subpanel = $(`	    
                <div class="divider channelheader">
                	<span>${name}</span>
                </div>
                <ul class="pv-menu-list">
                	<li>Range: <span id="lblrange"></span> <div id="sldrange"></div></li>
                	<li><span title="Minimum brightness of the color ramp, used for values at bottom limit of 'range'">Min Brightness</span>: <span id="lblminbright"></span> <div id="sldminbright"></div></li>
                	<li><input id="channel.color.picker" /></li>
                	<li><span title="Lower if too many channels are causing over-saturation. Set to zero to hide this channel.">Opacity</span>: <span id="lblweight"></span> <div id="sldweight"></div></li>
                </ul>
            `);
			
			let clampMin = material.uniforms.clampMin.value[i];
			let clampMax = material.uniforms.clampMax.value[i];
			let logRange = (clampMin >= 0 && clampMax > 256);
			let rangeToVal = function(k) {
				if (logRange) {
					let logMin = Math.max(clampMin, 1.);
					return (k > 0 ? logMin * Math.pow(clampMax / logMin, k) : 0);
				} else {
					return k;
				}
			}
			let valToRange = function(val) {
				if (logRange) {
					let logMin = Math.max(clampMin, 1.);
					return (val > 0 ? Math.log(val / logMin) / Math.log(clampMax / logMin) : 0);
				} else {
					return val;
				}
			}
		    subpanel.find('#sldrange').slider({
				range: true,
				values: [valToRange(clampMin), valToRange(clampMax)],
				min: valToRange(clampMin), max: valToRange(clampMax), step: .01,
				slide: (event, ui) => {
					material.uniforms.clampMin.value[i] = rangeToVal(ui.values[0]);
					material.uniforms.clampMax.value[i] = rangeToVal(ui.values[1]);
					setRangeLabel();
				}
		    });
			let setRangeLabel = function() {
				let min = material.uniforms.clampMin.value[i];
				let max = material.uniforms.clampMax.value[i];
				subpanel.find('#lblrange').html(`${parseInt(min)} to ${parseInt(max)}`);
			}
			setRangeLabel();
		    subpanel.find('#sldminbright').slider({
				value: material.uniforms.minBrightness.value[i],
				min: 0, max: 1, step: .01,
				slide: (event, ui) => {
					material.uniforms.minBrightness.value[i] = ui.value;
					setMinBrightnessLabel();
				}
		    });
			let setMinBrightnessLabel = function() {
				let val = material.uniforms.minBrightness.value[i];
				subpanel.find('#lblminbright').html(`${parseInt(100 * val)}%`);
			}
			setMinBrightnessLabel();
		    subpanel.find('#sldweight').slider({
				value: material.uniforms.channelWeight.value[i],
				min: 0, max: 1, step: .01,
				slide: (event, ui) => {
					material.uniforms.channelWeight.value[i] = ui.value;
					setWeightLabel();
				}
			});
			let setWeightLabel = function() {
				let val = material.uniforms.channelWeight.value[i];
				subpanel.find('#lblweight').html(`${parseInt(100 * val)}%`);
			}
			setWeightLabel();
			
			subpanel.find(`#channel\\.color\\.picker`).spectrum({
				flat: true,
				showInput: true,
				preferredFormat: 'rgb',
				cancelText: '',
				chooseText: 'Apply',
				color: `#${material.uniforms.channelColor.value[i].getHexString()}`,
				move: color => {
					let cRGB = color.toRgb();
					let tc = new THREE.Color().setRGB(cRGB.r / 255, cRGB.g / 255, cRGB.b / 255);
					material.uniforms.channelColor.value[i] = tc;
				},
				change: color => {
					let cRGB = color.toRgb();
					let tc = new THREE.Color().setRGB(cRGB.r / 255, cRGB.g / 255, cRGB.b / 255);
					material.uniforms.channelColor.value[i] = tc;
				}
			});
			
			panel.find('#channel-settings').append(subpanel);
			
	    }
	    for (let pcnum = 0; pcnum < pointclouds.length; pcnum++) {
			let pointcloud = pointclouds[pcnum];	    
			let material = pointcloud.material;
			let numChannels = pointcloud.pcoGeometry.channelNames.length;
			for (let chnum = 0; chnum < numChannels; chnum++) {
				let name = pointcloud.pcoGeometry.channelNames[chnum];
				if (numChannels == 1 && name == 'Intensity') {
					name = pointcloud.name;
				}
				initChannelSettings(material, chnum, name);
			}
	    }
		
		panel.find('.channelheader').each(function(){
			let header = $(this);
			let content = $(this).next();
			
			//header.addClass('accordion-header ui-widget');
			//content.addClass('accordion-content ui-widget');
			
			content.hide();
			
			header.click(() => {
				content.slideToggle();
			});
		});
	    
		panel.i18n();
		this.container.append(panel);

	}

}
