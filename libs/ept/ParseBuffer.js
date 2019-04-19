function parseEpt(event) {
	let buffer = event.data.buffer;
	let view = new DataView(buffer);
	let schema = event.data.schema;
	let scale = event.data.scale;
	let offset = event.data.offset;
	let mins = event.data.mins;
    let channelNames = event.data.channels;
    
	let dimensions = schema.reduce((p, c) => {
		p[c.name] = c;
		return p;
	}, { });

	let dimOffset = (name) => {
		let offset = 0;
		for (var i = 0; i < schema.length; ++i) {
			if (schema[i].name == name) return offset;
			offset += schema[i].size;
		}
		return undefined;
	};

	let getExtractor = (name) => {
		let offset = dimOffset(name);
		let type = dimensions[name].type;
		let size = dimensions[name].size;

		if (type == 'signed') switch (size) {
			case 1: return (p) => view.getInt8(p + offset);
			case 2: return (p) => view.getInt16(p + offset, true);
			case 4: return (p) => view.getInt32(p + offset, true);
			case 8: return (p) => view.getInt64(p + offset, true);
		}
		if (type == 'unsigned') switch (size) {
			case 1: return (p) => view.getUint8(p + offset);
			case 2: return (p) => view.getUint16(p + offset, true);
			case 4: return (p) => view.getUint32(p + offset, true);
			case 8: return (p) => view.getUint64(p + offset, true);
		}
		if (type == 'float') switch (size) {
			case 4: return (p) => view.getFloat32(p + offset, true);
			case 8: return (p) => view.getFloat64(p + offset, true);
		}

		let str = JSON.stringify(dimensions[name]);
		throw new Error(`Invalid dimension specification for ${name}: ${str}`);
	};

	let pointSize = schema.reduce((p, c) => p + c.size, 0);
	let numPoints = buffer.byteLength / pointSize;

	let xyzBuffer, rgbBuffer, intensityBuffer, classificationBuffer,
		returnNumberBuffer, numberOfReturnsBuffer, pointSourceIdBuffer;
	let xyz, rgb, intensity, classification, returnNumber, numberOfReturns,
		pointSourceId;
	let xyzExtractor, rgbExtractor, intensityExtractor, classificationExtractor,
		returnNumberExtractor, numberOfReturnsExtractor, pointSourceIdExtractor;
	let twoByteColor = false;

	if (dimensions['X'] && dimensions['Y'] && dimensions['Z']) {
		xyzBuffer = new ArrayBuffer(numPoints * 4 * 3);
		xyz = new Float32Array(xyzBuffer);
		xyzExtractor = [
			getExtractor('X'),
			getExtractor('Y'),
			getExtractor('Z')
		];
	}

	if (dimensions['Red'] && dimensions['Green'] && dimensions['Blue']) {
		rgbBuffer = new ArrayBuffer(numPoints * 4);
		rgb = new Uint8Array(rgbBuffer);
		rgbExtractor = [
			getExtractor('Red'),
			getExtractor('Green'),
			getExtractor('Blue')
		];

		let r, g, b, pos;
		for (let i = 0; i < numPoints && !twoByteColor; ++i) {
			pos = i * pointSize;
			r = rgbExtractor[0](pos);
			g = rgbExtractor[1](pos);
			b = rgbExtractor[2](pos);
			if (r > 255 || g > 255 || b > 255) twoByteColor = true;
		}
	}

	if (dimensions['Intensity']) {
		intensityBuffer = new ArrayBuffer(numPoints * 4);
		intensity = new Float32Array(intensityBuffer);
		intensityExtractor = getExtractor('Intensity');
	}

	if (dimensions['Classification']) {
		classificationBuffer = new ArrayBuffer(numPoints);
		classification = new Uint8Array(classificationBuffer);
		classificationExtractor = getExtractor('Classification');
	}

	if (dimensions['ReturnNumber']) {
		returnNumberBuffer = new ArrayBuffer(numPoints);
		returnNumber = new Uint8Array(returnNumberBuffer);
		returnNumberExtractor = getExtractor('ReturnNumber');
	}

	if (dimensions['NumberOfReturns']) {
		numberOfReturnsBuffer = new ArrayBuffer(numPoints);
		numberOfReturns = new Uint8Array(numberOfReturnsBuffer);
		numberOfReturnsExtractor = getExtractor('NumberOfReturns');
	}

	if (dimensions['PointSourceId']) {
		pointSourceIdBuffer = new ArrayBuffer(numPoints * 2);
		pointSourceId = new Uint16Array(pointSourceIdBuffer);
		pointSourceIdExtractor = getExtractor('PointSourceId');
	}



    

    let channelBuffers = [];
    let channels = [];
    let channelExtractors = [];

    for (let dimName in dimensions) {
	if (channelNames.indexOf(dimName) == -1) {
	    continue;
	}
	let dim = dimensions[dimName];

	let buf = new ArrayBuffer(numPoints * dim.size);
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
	let extractor = getExtractor(dimName);

	channelBuffers.push(buf);
	channels.push(data);
	channelExtractors.push(extractor);
    }
    
	let mean = [0, 0, 0];
	let bounds = {
		min: [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE],
		max: [-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE],
	};

	let x, y, z, r, g, b;
	for (let i = 0; i < numPoints; ++i) {
		let pos = i * pointSize;


	
	for (let ch = 0; ch < channels.length; ch++) {
	    channels[ch][i] = channelExtractors[ch](pos);
	}
	
		if (xyz) {
			x = xyzExtractor[0](pos) * scale.x + offset.x - mins[0];
			y = xyzExtractor[1](pos) * scale.y + offset.y - mins[1];
			z = xyzExtractor[2](pos) * scale.z + offset.z - mins[2];

			mean[0] += x / numPoints;
			mean[1] += y / numPoints;
			mean[2] += z / numPoints;

			bounds.min[0] = Math.min(bounds.min[0], x);
			bounds.min[1] = Math.min(bounds.min[1], y);
			bounds.min[2] = Math.min(bounds.min[2], z);

			bounds.max[0] = Math.max(bounds.max[0], x);
			bounds.max[1] = Math.max(bounds.max[1], y);
			bounds.max[2] = Math.max(bounds.max[2], z);

			xyz[3 * i + 0] = x;
			xyz[3 * i + 1] = y;
			xyz[3 * i + 2] = z;
		}

		if (rgb) {
			r = rgbExtractor[0](pos);
			g = rgbExtractor[1](pos);
			b = rgbExtractor[2](pos);

			if (twoByteColor) {
				r /= 256;
				g /= 256;
				b /= 256;
			}

			rgb[4 * i + 0] = r;
			rgb[4 * i + 1] = g;
			rgb[4 * i + 2] = b;
		}

		if (intensity) intensity[i] = intensityExtractor(pos);
		if (classification) classification[i] = classificationExtractor(pos);
		if (returnNumber) returnNumber[i] = returnNumberExtractor(pos);
		if (numberOfReturns) numberOfReturns[i] = numberOfReturnsExtractor(pos);
		if (pointSourceId) pointSourceId[i] = pointSourceIdExtractor(pos);
	}

	let indicesBuffer = new ArrayBuffer(numPoints * 4);
	let indices = new Uint32Array(indicesBuffer);
	for (let i = 0; i < numPoints; ++i) {
		indices[i] = i;
	}

	let message = {
		numPoints: numPoints,
		tightBoundingBox: bounds,
		mean: mean,

		position: xyzBuffer,
		color: rgbBuffer,
		intensity: intensityBuffer,
		classification: classificationBuffer,
		returnNumber: returnNumberBuffer,
		numberOfReturns: numberOfReturnsBuffer,
		pointSourceId: pointSourceIdBuffer,
	    indices: indicesBuffer,
	    channels: channelBuffers,
	};

	let transferables = [
		message.position,
		message.color,
		message.intensity,
		message.classification,
		message.returnNumber,
		message.numberOfReturns,
		message.pointSourceId,
	    message.indices
	].concat(message.channels)
	.filter((v) => v);

	postMessage(message, transferables);
}

