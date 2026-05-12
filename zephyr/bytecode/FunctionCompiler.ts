import {type StatementNode} from '../ast'
import {type BytecodeGenerator} from './BytecodeGenerator'
import {type CompilerState} from './CompilerState'
import {type VmProgram, Opcode} from './context'
import {emitStatement} from './emmiters/statementEmitter'

interface LoopControlContext {
	breakJumps: number[],
	continueJumps: number[],
	continueTarget: number | null,
}

class FunctionCompiler {
	private loopStack: LoopControlContext[] = []

	constructor(
		private readonly generator: BytecodeGenerator,
		private readonly state: CompilerState,
	) {
	}

	buildVmProgram(): VmProgram {
		return this.state.buildVmProgram()
	}

	emitNilReturn(): void {
		this.state.emitNoArg(Opcode.Nil)
		this.state.emitNoArg(Opcode.Return)
	}

	emitStatement(statement: StatementNode): void {
		emitStatement(this.state, this.generator, this, statement)
	}

	getState(): CompilerState {
		return this.state
	}

	enterScope(): void {
		this.state.enterScope()
	}

	leaveScope(): void {
		this.state.leaveScope()
	}

	beginLoop(): void {
		this.loopStack.push({
			breakJumps: [],
			continueJumps: [],
			continueTarget: null,
		})
	}

	emitBreak(): void {
		const loop = this.getCurrentLoop()
		loop.breakJumps.push(this.state.emitJump(Opcode.Jump))
	}

	emitContinue(): void {
		const loop = this.getCurrentLoop()
		loop.continueJumps.push(this.state.emitJump(Opcode.Jump))
	}

	setContinueTarget(target: number): void {
		this.getCurrentLoop().continueTarget = target
	}

	endLoop(breakTarget: number): void {
		const loop = this.loopStack.pop()
		if (loop === undefined) {
			throw new Error('FunctionCompiler: неожиданный выход из loop-контекста')
		}
		if (loop.continueTarget === null) {
			throw new Error('FunctionCompiler: continue target не установлен')
		}
		for (const jump of loop.breakJumps) {
			this.state.patchJump(jump, breakTarget)
		}
		for (const jump of loop.continueJumps) {
			this.state.patchJump(jump, loop.continueTarget)
		}
	}

	private getCurrentLoop(): LoopControlContext {
		const loop = this.loopStack[this.loopStack.length - 1]
		if (loop === undefined) {
			throw new Error('FunctionCompiler: break/continue вне loop-контекста')
		}

		return loop
	}
}

export {
	FunctionCompiler,
}
