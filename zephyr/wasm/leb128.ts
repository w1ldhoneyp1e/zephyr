function encodeUnsignedLeb128(value: number): number[] {
	const bytes: number[] = []
	let remaining = value >>> 0

	do {
		let byte = remaining & 0x7f
		remaining >>>= 7
		if (remaining !== 0) {
			byte |= 0x80
		}
		bytes.push(byte)
	} while (remaining !== 0)

	return bytes
}

function encodeSignedLeb128(value: number): number[] {
	const bytes: number[] = []
	let remaining = value | 0
	let more = true

	while (more) {
		const byte = remaining & 0x7f
		remaining >>= 7
		const signBitSet = (byte & 0x40) !== 0
		more = !((remaining === 0 && !signBitSet) || (remaining === -1 && signBitSet))
		bytes.push(more
			? byte | 0x80
			: byte)
	}

	return bytes
}

export {
	encodeSignedLeb128,
	encodeUnsignedLeb128,
}
