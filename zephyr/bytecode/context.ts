import {
	type ClosureInstruction,
	type ConstantPoolItem,
	type Instruction,
	type NoArgOpcode,
	type NumArgOpcode,
	type Value,
	type VmFunctionTemplate,
	type VmProgram,
	Opcode,
} from '../../vm/types'
import {
	type AssignmentStatementNode,
	type ExpressionNode,
	type ForRangeStatementNode,
	type FunctionDeclarationNode,
	type ProgramNode,
	type StatementNode,
} from '../ast'

interface ScopeInfo {
	locals: Set<string>,
}

interface ResolvedLocalBinding {
	kind: 'local',
	slot: number,
}

interface ResolvedUpvalueBinding {
	kind: 'upvalue',
	index: number,
}

interface ResolvedGlobalBinding {
	kind: 'global',
	name: string,
}

type ResolvedBinding = ResolvedLocalBinding | ResolvedUpvalueBinding
type ResolvedExpressionBinding = ResolvedBinding | ResolvedGlobalBinding

interface UpvalueDescriptor {
	isLocal: boolean,
	index: number,
}

export {
	type AssignmentStatementNode,
	type ClosureInstruction,
	type ConstantPoolItem,
	type ExpressionNode,
	type ForRangeStatementNode,
	type FunctionDeclarationNode,
	type Instruction,
	type NoArgOpcode,
	type NumArgOpcode,
	Opcode,
	type ProgramNode,
	type ResolvedBinding,
	type ResolvedExpressionBinding,
	type ScopeInfo,
	type StatementNode,
	type UpvalueDescriptor,
	type Value,
	type VmFunctionTemplate,
	type VmProgram,
}
