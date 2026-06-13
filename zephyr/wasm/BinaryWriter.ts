import {encodeSignedLeb128, encodeUnsignedLeb128} from './leb128'

class BinaryWriter {
	private readonly bytes: number[] = []

	writeByte(value: number): void {
		this.bytes.push(value & 0xff)
	}

	writeBytes(values: readonly number[] | Uint8Array): void {
		for (const value of values) {
			this.writeByte(value)
		}
	}

	writeUnsignedLeb128(value: number): void {
		this.writeBytes(encodeUnsignedLeb128(value))
	}

	writeSignedLeb128(value: number): void {
		this.writeBytes(encodeSignedLeb128(value))
	}

	writeFloat64(value: number): void {
		const buffer = new ArrayBuffer(8)
		new DataView(buffer).setFloat64(0, value, true)
		this.writeBytes(new Uint8Array(buffer))
	}

	writeString(value: string): void {
		const encoded = new TextEncoder().encode(value)
		this.writeUnsignedLeb128(encoded.length)
		this.writeBytes(encoded)
	}

	toUint8Array(): Uint8Array {
		return Uint8Array.from(this.bytes)
	}
}

export {
	BinaryWriter,
}
