import {XHRFactory} from "../../XHRFactory.js";

export class EptBinaryLoader {
	extension() {
		return '.bin';
	}

	workerPath() {
		return Potree.scriptPath + '/workers/EptBinaryDecoderWorker.js';
	}

	load(node) {
		if (node.loaded) return;

		let url = node.url() + this.extension();

		let xhr = XHRFactory.createXMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.responseType = 'arraybuffer';
		xhr.overrideMimeType('text/plain; charset=x-user-defined');
		xhr.onreadystatechange = () => {
			if (xhr.readyState === 4) {
				if (xhr.status === 200) {
					let buffer = xhr.response;
					this.parse(node, buffer);
				} else {
					console.log('Failed ' + url + ': ' + xhr.status);
				}
			}
		};

		try {
			xhr.send(null);
		}
		catch (e) {
			console.log('Failed request: ' + e);
		}
	}

	parse(node, buffer) {
		let workerPath = this.workerPath();
		let worker = Potree.workerPool.getWorker(workerPath);

		worker.onmessage = function(e) {
			let g = new THREE.BufferGeometry();
			let numPoints = e.data.numPoints;

			let position = new Float32Array(e.data.position);
			g.addAttribute('position', new THREE.BufferAttribute(position, 3));

			let indices = new Uint8Array(e.data.indices);
			g.addAttribute('indices', new THREE.BufferAttribute(indices, 4));

			if (e.data.color) {
				let color = new Uint8Array(e.data.color);
				g.addAttribute('color',
						new THREE.BufferAttribute(color, 4, true));
			}
			if (e.data.intensity) {
				let intensity = new Float32Array(e.data.intensity);
				g.addAttribute('intensity',
						new THREE.BufferAttribute(intensity, 1));
			}
			if (e.data.classification) {
				let classification = new Uint8Array(e.data.classification);
				g.addAttribute('classification',
						new THREE.BufferAttribute(classification, 1));
			}
			if (e.data.returnNumber) {
				let returnNumber = new Uint8Array(e.data.returnNumber);
				g.addAttribute('returnNumber',
						new THREE.BufferAttribute(returnNumber, 1));
			}
			if (e.data.numberOfReturns) {
				let numberOfReturns = new Uint8Array(e.data.numberOfReturns);
				g.addAttribute('numberOfReturns',
						new THREE.BufferAttribute(numberOfReturns, 1));
			}
			if (e.data.pointSourceId) {
				let pointSourceId = new Uint16Array(e.data.pointSourceId);
				g.addAttribute('pointSourceID',
						new THREE.BufferAttribute(pointSourceId, 1));
			}

			g.attributes.indices.normalized = true;

		    for (let i = 0; i < e.data.channels.length; i++) {
			let dim = node.ept.channelDefs[node.ept.channelNames[i]];
			let buf = e.data.channels[i];
			let data = null;
			if (dim.type == 'signed') switch (dim.size) {
			    case 1: data = new Int8Array(buf); break;
			    case 2: data = new Int16Array(buf); break;
			    case 4: data = new Int32Array(buf); break;
			    //case 8: data = new Int64Array(buf); break;
			}
			if (dim.type == 'unsigned') switch (dim.size) {
			    case 1: data = new Uint8Array(buf); break;
			    case 2: data = new Uint16Array(buf); break;
			    case 4: data = new Uint32Array(buf); break;
			    //case 8: data = new Uint64Array(buf); break;
			}
			if (dim.type == 'float') switch (dim.size) {
			    case 4: data = new Float32Array(buf); break;
			    case 8: data = new Float64Array(buf); break;
			}
			g.addAttribute('channel' + i, new THREE.BufferAttribute(data, 1));
		    }
		    
			let tightBoundingBox = new THREE.Box3(
				new THREE.Vector3().fromArray(e.data.tightBoundingBox.min),
				new THREE.Vector3().fromArray(e.data.tightBoundingBox.max)
			);

			node.doneLoading(
					g,
					tightBoundingBox,
					numPoints,
					new THREE.Vector3(...e.data.mean));

			Potree.workerPool.returnWorker(workerPath, worker);
		};


		let toArray = (v) => [v.x, v.y, v.z];
		let message = {
			buffer: buffer,
			schema: node.ept.schema,
			scale: node.ept.eptScale,
		    offset: node.ept.eptOffset,
		    channels: node.ept.channelNames,
			mins: toArray(node.key.b.min)
		};

		worker.postMessage(message, [message.buffer]);
	}
};

