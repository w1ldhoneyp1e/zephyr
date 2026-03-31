import {
	type Instruction,
	type NoArgOpcode,
	type NumArgOpcode,
	type Value,
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
	['return', Opcode.Return],
	['get_el', Opcode.GetEl],
	['set_el', Opcode.SetEl],
])

const NUM_ARG_OPCODES = new Map<string, NumArgOpcode>([
	['const', Opcode.Const],
	['get_local', Opcode.GetLocal],
	['set_local', Opcode.SetLocal],
	['inc_local', Opcode.IncLocal],
	['dec_local', Opcode.DecLocal],
	['def_global', Opcode.DefGlobal],
	['set_global', Opcode.SetGlobal],
	['get_global', Opcode.GetGlobal],
	['create_arr', Opcode.CreateArr],
])

function parseNum(s: string, context: string): number {
	const n = Number(s)
	if (Number.isNaN(n)) {
		throw new Error(`Не число: "${s}" (${context})`)
	}

	return n
}

function parseConstantLine(line: string): Value {
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

	throw new Error(`Неизвестный тип константы: ${line}`)
}

function stripLineNumber(line: string): string {
	const match = line.match(/^\d+\s+(.+)$/)

	return match
		? match[1].trim()
		: line
}

function parseInstruction(line: string): Instruction {
	const stripped = stripLineNumber(line)
	const spaceIdx = stripped.indexOf(' ')
	const op = (spaceIdx === -1
		? stripped
		: stripped.slice(0, spaceIdx)).toLowerCase()
	const arg = spaceIdx === -1
		? ''
		: stripped.slice(spaceIdx + 1).trim()

	const noArgOp = NO_ARG_OPCODES.get(op)
	if (noArgOp !== undefined) {
		return {op: noArgOp}
	}

	const numArgOp = NUM_ARG_OPCODES.get(op)
	if (numArgOp !== undefined) {
		return {
			op: numArgOp,
			arg: parseNum(arg, op),
		}
	}

	throw new Error(`Неизвестный опкод: "${op}"`)
}

function parseProgramBlock(lines: string[]): VmProgram {
	let name = '__anonymous__'
	let argc = 0
	let localsCount = 0
	const constants: Value[] = []
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
