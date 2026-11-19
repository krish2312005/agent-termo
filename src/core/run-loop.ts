// =============================================================================
// Run Loop — Event-driven agent loop with state machine
// =============================================================================

import {
  SessionEngine,
  RunResult,
  ConversationMessage,
  ToolCall,
  ToolResult,
  VerificationResult,
  VerificationEvidence,
  VerificationIssue,
  LLMResponse,
} from './types.js';
import { createEvent } from './events.js';

// LLM Client Interface
export interface LLMClient {
  complete(messages: ConversationMessage[], tools?: any[]): Promise<LLMResponse>;
  streamComplete(messages: ConversationMessage[], tools?: any[], onChunk?: (text: string) => void, onToolCallDelta?: (delta: any) => void): AsyncGenerator<LLMResponse>;
  getModel(): string;
  setModel(model: string): void;
  getThinkingCapacity(): string;
  setThinkingCapacity(capacity: string): void;
  formatUsage(): string;
  cancelCurrentRequest(): void;
}

// Run Loop States
export type RunLoopState =
  | 'idle'
  | 'waiting_for_model'
  | 'model_streaming'
  | 'executing_tools'
  | 'tool_running'
  | 'waiting_for_permission'
  | 'verifying_completion'
  | 'completed'
  | 'interrupted'
  | 'failed';

// Run Loop Context
export interface RunLoopContext {
  sessionEngine: SessionEngine;
  llmClient: LLMClient;
  maxIterations: number;
  onStateChange?: (state: RunLoopState) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onToolResult?: (toolCall: ToolCall, result: ToolResult) => void;
  onTextDelta?: (text: string) => void;
  onThinkingDelta?: (text: string) => void;
}

// Verification Evidence Collector
export class EvidenceCollector {
  private filesWritten = new Map<string, string>();
  private commandsRun: string[] = [];
  private checksPassed: string[] = [];
  private checksFailed: string[] = [];
  
  recordFileWrite(path: string, content: string): void {
    this.filesWritten.set(path, content);
  }
  
  recordCommand(command: string): void {
    this.commandsRun.push(command);
  }
  
  recordCheckPassed(name: string): void {
    this.checksPassed.push(name);
  }
  
  recordCheckFailed(name: string): void {
    this.checksFailed.push(name);
  }
  
  getEvidence(): VerificationEvidence {
    return {
      filesWritten: new Map(this.filesWritten),
      commandsRun: [...this.commandsRun],
      checksPassed: [...this.checksPassed],
      checksFailed: [...this.checksFailed],
    };
  }
  
  reset(): void {
    this.filesWritten.clear();
    this.commandsRun = [];
    this.checksPassed = [];
    this.checksFailed = [];
  }
}

// Main Run Loop
export class RunLoop {
  private context: RunLoopContext;
  private state: RunLoopState = 'idle';
  private iteration = 0;
  private evidenceCollector = new EvidenceCollector();
  private aborted = false;
  
  constructor(context: RunLoopContext) {
    this.context = context;
  }
  
  getState(): RunLoopState {
    return this.state;
  }
  
  setState(newState: RunLoopState): void {
    this.state = newState;
    this.context.onStateChange?.(newState);
  }
  
  async run(userInput: string, continuing = false): Promise<RunResult> {
    this.aborted = false;
    this.iteration = 0;
    this.evidenceCollector.reset();
    
    const { sessionEngine, llmClient, maxIterations } = this.context;
    
    // Initialize task state if not continuing
    if (!continuing) {
      // Session engine will handle task state
    }
    
    // Add user message
    await sessionEngine.addUserMessage(userInput);
    
    // Main loop
    while (this.iteration < maxIterations && !this.aborted) {
      this.iteration++;
      
      // Check for interruption
      if (this.aborted) {
        return { success: false, error: 'Run aborted', interrupted: true };
      }
      
      // Build messages for LLM
      const messages = this.buildMessages(sessionEngine.getState());
      
      // Get tool definitions
      const toolDefs = sessionEngine.getState().messages.length > 0 
        ? (sessionEngine as any).toolRegistry?.getProviderDefinitions() ?? []
        : [];
      
      this.setState('waiting_for_model');
      
      // Stream from LLM
      let response: LLMResponse | null = null;
      try {
        this.setState('model_streaming');
        
        let fullContent = '';
        let toolCalls: ToolCall[] = [];
        
        for await (const chunk of llmClient.streamComplete(
          messages,
          toolDefs.length > 0 ? toolDefs : undefined,
          (text) => {
            fullContent += text;
            this.context.onTextDelta?.(text);
          },
          (_delta) => {
            // Handle tool call deltas
          }
        )) {
          response = chunk;
          fullContent = chunk.content;
          toolCalls = chunk.toolCalls;
        }
        
        if (!response) {
          throw new Error('No response from LLM');
        }
        
        // Add assistant message
        await sessionEngine.addAssistantMessage(fullContent, toolCalls);
        
        // If no tool calls, we're done
        if (toolCalls.length === 0) {
          this.setState('completed');
          
          // Verify completion if files were changed
          const verification = await this.verifyCompletion(sessionEngine);
          return {
            success: true,
            content: fullContent,
            verification,
          };
        }
        
        // Execute tools
        const results = await this.executeTools(toolCalls, sessionEngine);
        
        // Add tool results to conversation
        for (let i = 0; i < toolCalls.length; i++) {
          const tc = toolCalls[i]!;
          const result = results[i]!;
          await sessionEngine.addToolResult(tc.id, result);
          this.context.onToolResult?.(tc, result);
          
          // Collect evidence
          this.collectEvidence(tc, result);
        }
        
        // Continue loop
        this.setState('executing_tools');
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (errorMessage.includes('abort') || errorMessage.includes('cancel')) {
          this.setState('interrupted');
          await sessionEngine.pause('cancelled by user');
          return { success: false, error: errorMessage, interrupted: true };
        }
        
        this.setState('failed');
        await sessionEngine.pause(errorMessage);
        return { success: false, error: errorMessage };
      }
    }
    
    // Max iterations reached
    if (this.iteration >= maxIterations) {
      await sessionEngine.pause(`Max iterations (${maxIterations}) reached`);
      return { success: false, error: `Max iterations reached`, interrupted: true };
    }
    
    return { success: false, error: 'Run loop ended unexpectedly' };
  }
  
  private buildMessages(sessionState: any): ConversationMessage[] {
    // Return conversation messages, possibly with compaction
    return sessionState.messages;
  }
  
  private async executeTools(
    toolCalls: ToolCall[],
    sessionEngine: SessionEngine
  ): Promise<ToolResult[]> {
    this.setState('executing_tools');
    
    const results: ToolResult[] = [];
    
    for (const toolCall of toolCalls) {
      if (this.aborted) break;
      
      this.setState('tool_running');
      this.context.onToolCall?.(toolCall);
      
      // Emit tool.started event
      await (sessionEngine as any).eventBus?.publish(createEvent(
        (sessionEngine as any).sessionId,
        'tool.started',
        { toolCallId: toolCall.id, name: toolCall.name }
      ));
      
      try {
        const result = await sessionEngine.executeTool(toolCall.name, toolCall.arguments);
        results.push(result);
        
        // Emit completion event
        await (sessionEngine as any).eventBus?.publish(createEvent(
          (sessionEngine as any).sessionId,
          result.success ? 'tool.completed' : 'tool.failed',
          {
            toolCallId: toolCall.id,
            name: toolCall.name,
            result,
            error: result.error,
            metadata: {
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
              durationMs: result.durationMs,
              command: result.command,
              cwd: result.cwd,
            },
          }
        ));
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const result: ToolResult = {
          success: false,
          error: errorMessage,
          durationMs: 0,
        };
        results.push(result);
        
        await (sessionEngine as any).eventBus?.publish(createEvent(
          (sessionEngine as any).sessionId,
          'tool.failed',
          {
            toolCallId: toolCall.id,
            name: toolCall.name,
            error: errorMessage,
          }
        ));
      }
    }
    
    return results;
  }
  
  private collectEvidence(toolCall: ToolCall, _result: ToolResult): void {
    if (toolCall.name === 'file:write' || toolCall.name === 'file:edit') {
      const path = toolCall.arguments.path as string;
      const content = toolCall.arguments.content as string ?? toolCall.arguments.new_string as string;
      if (path && content) {
        this.evidenceCollector.recordFileWrite(path, content);
      }
    }
    
    if (toolCall.name === 'bash:execute') {
      const command = toolCall.arguments.command as string;
      if (command) {
        this.evidenceCollector.recordCommand(command);
      }
    }
  }
  
  private async verifyCompletion(_sessionEngine: SessionEngine): Promise<VerificationResult | undefined> {
    const evidence = this.evidenceCollector.getEvidence();
    
    if (evidence.filesWritten.size === 0 && evidence.commandsRun.length === 0) {
      return undefined; // Nothing to verify
    }
    
    this.setState('verifying_completion');
    
    // Run project checks
    const issues: VerificationIssue[] = [];
    
    // Check for stub implementations
    for (const [path, content] of evidence.filesWritten) {
      if (this.isStubImplementation(content)) {
        issues.push({
          type: 'stub_implementation',
          message: `File ${path} appears to contain a stub implementation`,
          file: path,
          severity: 'error',
        });
      }
    }
    
    // Run typecheck if available
    if (evidence.commandsRun.some(c => c.includes('tsc') || c.includes('typecheck'))) {
      // Typecheck was run, check results
    }
    
    // Run lint if available
    if (evidence.commandsRun.some(c => c.includes('lint') || c.includes('eslint'))) {
      // Lint was run
    }
    
    // Run tests if available
    if (evidence.commandsRun.some(c => c.includes('test') || c.includes('vitest') || c.includes('jest'))) {
      // Tests were run
    }
    
    const ok = issues.filter(i => i.severity === 'error').length === 0;
    
    return { ok, issues, evidence };
  }
  
  private isStubImplementation(content: string): boolean {
    const stubPatterns = [
      /TODO:/i,
      /FIXME:/i,
      /stub/i,
      /placeholder/i,
      /not implemented/i,
      /throw new Error\(['"]Not implemented['"]\)/i,
      /return null;/i,
      /return undefined;/i,
    ];
    
    return stubPatterns.some(pattern => pattern.test(content));
  }
  
  abort(): void {
    this.aborted = true;
    this.context.llmClient.cancelCurrentRequest();
  }
}

// Run Loop Factory
export function createRunLoop(context: RunLoopContext): RunLoop {
  return new RunLoop(context);
}