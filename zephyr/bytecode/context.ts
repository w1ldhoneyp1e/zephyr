import {
	type ClosureInstruction,
	type ConstantPoolItem,
	type Instruction,
	type NoArgOpcode,
	type NumArgOpcode,
	type Value,
	type VmFunctionTemplate,
	type VmProgram,
	type VmStructTemplate,
	Opcode,
} from '../../vm/types'
import {
	type AssignmentStatementNode,
	type BreakStatementNode,
	type ClassDeclarationNode,
	type ContinueStatementNode,
	type ExpressionNode,
	type ForRangeStatementNode,
	type FunctionDeclarationNode,
	type LambdaExpressionNode,
	type MethodDeclarationNode,
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
	type BreakStatementNode,
	type ClassDeclarationNode,
	type ContinueStatementNode,
	type ClosureInstruction,
	type ConstantPoolItem,
	type ExpressionNode,
	type ForRangeStatementNode,
	type FunctionDeclarationNode,
	type LambdaExpressionNode,
	type Instruction,
	type MethodDeclarationNode,
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
	type VmStructTemplate,
}
