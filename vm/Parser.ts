import {
	type ClosureInstruction,
	type ConstantPoolItem,
	type Instruction,
	type NoArgOpcode,
	type NumArgOpcode,
	type VmFunctionTemplate,
	type VmProgram,
	Opcode,
} from './types'

const NO_ARG_OPCODES = new Map<string, NoArgOpcode>([
	['true', Opcode.True],
	['false', Opcode.False],
	['nil', Opcode.Nil],
	['pop', Opcode.Pop],
	['add', Opcode.Add],
	['sub', Opcode.Sub],
	['mul', Opcode.Mul],
	['div', Opcode.Div],
	['mod', Opcode.Mod],
	['neg', Opcode.Neg],
	['eq', Opcode.Eq],
	['ne', Opcode.Ne],
	['lt', Opcode.Lt],
	['lte', Opcode.Lte],
	['gt', Opcode.Gt],
	['gte', Opcode.Gte],
	['and', Opcode.And],
	['or', Opcode.Or],
	['not', Opcode.Not],
	['return', Opcode.Return],
	['get_el', Opcode.GetEl],
	['set_el', Opcode.SetEl],
])

const NUM_ARG_OPCODES = new Map<string, NumArgOpcode>([
	['const', Opcode.Const],
	['jump', Opcode.Jump],
	['jump_if_false', Opcode.JumpIfFalse],
	['get_local', Opcode.GetLocal],
	['set_local', Opcode.SetLocal],
	['inc_local', Opcode.IncLocal],
	['dec_local', Opcode.DecLocal],
	['get_upvalue', Opcode.GetUpvalue],
	['set_upvalue', Opcode.SetUpvalue],
	['def_global', Opcode.DefGlobal],
	['set_global', Opcode.SetGlobal],
	['get_global', Opcode.GetGlobal],
	['create_arr', Opcode.CreateArr],
	['get_prop', Opcode.GetProp],
	['set_prop', Opcode.SetProp],
	['call', Opcode.Call],
])

function parseNum(s: string, context: string): number {
	const n = Number(s)
	if (Number.isNaN(n)) {
		throw new Error(`Не число: "${s}" (${context})`)
	}

	return n
}

function parseConstantLine(line: string): ConstantPoolItem {
	if (line === 'nil') {
		return null
	}
	if (line === 'bool true' || line === 'true') {
		return true
	}
	if (line === 'bool false' || line === 'false') {
		return false
	}
	if (line.startsWith('number ')) {
		return parseNum(line.slice(7).trim(), line)
	}
	if (line.startsWith('string ')) {
		return line.slice(7)
	}
	if (line.startsWith('function ')) {
		const parts = line.slice(9).trim()
			.split(/\s+/)
		if (parts.length < 3) {
			throw new Error(`Неверная константа function: ${line}`)
		}

		return {
			kind: 'function',
			programIndex: parseInt(parts[0], 10),
			arity: parseInt(parts[1], 10),
			upvalueCount: parseInt(parts[2], 10),
		} satisfies VmFunctionTemplate
	}
	if (line.startsWith('class ')) {
		const parts = line.slice(6).trim()
			.split(/\s+/)
		if (parts.length < 2) {
			throw new Error(`Неверная константа class: ${line}`)
		}
		const [name, , ...fields] = parts

		return {
			kind: 'struct',
			name,
			baseClass: null,
			fields,
			methods: {},
		}
	}

	throw new Error(`Неизвестный тип константы: ${line}`)
}

function stripLineNumber(line: string): string {
	const match = line.match(/^\d+\s+(.+)$/)

	return match
		? match[1].trim()
		: line
}

function parseClosureLine(parts: string[]): ClosureInstruction {
	if (parts.length < 3) {
		throw new Error(`Неверная инструкция closure: ${parts.join(' ')}`)
	}
	const functionConstIndex = parseNum(parts[1], 'closure')
	const pairCount = parseNum(parts[2], 'closure')
	const upvalues: {
		isLocal: boolean,
		index: number,
	}[] = []
	let idx = 3
	for (let i = 0; i < pairCount; i++) {
		if (idx + 1 >= parts.length) {
			throw new Error('closure: не хватает пар upvalue')
		}
		const isLocal = parts[idx] === '1'
		const index = parseNum(parts[idx + 1], 'closure upvalue')
		upvalues.push({
			isLocal,
			index,
		})
		idx += 2
	}

	return {
		op: Opcode.Closure,
		functionConstIndex,
		upvalues,
	}
}

function parseInstruction(line: string): Instruction {
	const stripped = stripLineNumber(line)
	const parts = stripped.split(/\s+/).filter(p => p.length > 0)
	if (parts.length === 0) {
		throw new Error('Пустая инструкция')
	}
	const op = parts[0].toLowerCase()

	if (op === 'closure') {

		return parseClosureLine(parts)
	}

	const spaceIdx = stripped.indexOf(' ')
	const opSingle = (spaceIdx === -1
		? stripped
		: stripped.slice(0, spaceIdx)).toLowerCase()
	const arg = spaceIdx === -1
		? ''
		: stripped.slice(spaceIdx + 1).trim()

	const noArgOp = NO_ARG_OPCODES.get(opSingle)
	if (noArgOp !== undefined) {
		return {op: noArgOp}
	}

	const numArgOp = NUM_ARG_OPCODES.get(opSingle)
	if (numArgOp !== undefined) {
		return {
			op: numArgOp,
			arg: parseNum(arg, opSingle),
		}
	}

	throw new Error(`Неизвестный опкод: "${opSingle}"`)
}

function parseProgramBlock(lines: string[]): VmProgram {
	let name = '__anonymous__'
	let argc = 0
	let localsCount = 0
	const constants: ConstantPoolItem[] = []
	const instructions: Instruction[] = []

	type Section = 'header' | 'constants' | 'code'
	let section: Section = 'header'

	for (const rawLine of lines) {
		const line = rawLine.trim()
		if (!line || line.startsWith(';')) {
			continue
		}

		if (line === '.constants') {
			section = 'constants'
			continue
		}

		if (line === '.code') {
			section = 'code'
			continue
		}

		if (section === 'header') {
			if (line.startsWith('.name ')) {
				name = line.slice(6).trim()
			}
			else if (line.startsWith('.argc ')) {
				argc = parseInt(line.slice(6).trim(), 10)
			}
			else if (line.startsWith('.locals ')) {
				localsCount = parseInt(line.slice(8).trim(), 10)
			}
		}
		else if (section === 'constants') {
			constants.push(parseConstantLine(line))
		}
		else if (section === 'code') {
			instructions.push(parseInstruction(rawLine))
		}
	}

	return {
		name,
		argc,
		localsCount,
		constants,
		instructions,
	}
}

class Parser {
	parse(source: string): VmProgram[] {
		const lines = source.split(/\r?\n/)
		const programs: VmProgram[] = []
		let inDef = false
		let currentLines: string[] = []

		for (const line of lines) {
			const trimmed = line.trim()
			if (trimmed === '.def') {
				inDef = true
				currentLines = []
			}
			else if (trimmed === '.end_def') {
				if (inDef) {
					programs.push(parseProgramBlock(currentLines))
					inDef = false
					currentLines = []
				}
			}
			else if (inDef) {
				currentLines.push(line)
			}
		}

		return programs
	}
}

export {
	Parser,
}
