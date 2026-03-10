// ============================================================
// Shared types — barrel export
// ============================================================

export type {
  ElementRef,
  ElementState,
  BoundingBox,
  LocatorCandidates,
} from "./types/elements.js";

export type {
  PageSnapshot,
  LoadingState,
  FrameInfo,
  Viewport,
  ScrollPosition,
} from "./types/snapshot.js";

export type {
  Action,
  ClickAction,
  TypeAction,
  PressAction,
  ScrollAction,
  NavigateAction,
  WaitAction,
  SelectAction,
  ExtractAction,
  ActionResult,
  ActionError,
  ActionErrorCode,
} from "./types/actions.js";

export type {
  MessageBase,
  ObserveRequest,
  ObserveResponse,
  ActRequest,
  ActResponse,
  NavigationEvent,
  DomChangeEvent,
  DialogEvent,
  ConsoleErrorEvent,
  TabEvent,
  PushEvent,
  InterruptRequest,
  InterruptResponse,
  ErrorResponse,
  ErrorCode,
  ListTabsRequest,
  ListTabsResponse,
  ExtensionStatusRequest,
  ExtensionStatusResponse,
  OpenTabRequest,
  OpenTabResponse,
  TabInfo,
  Request,
  Response,
  BridgeMessage,
} from "./types/messages.js";

export type {
  SideEffectLevel,
  RiskAssessment,
  RiskTag,
  ApprovalRequest,
  ApprovalDecision,
  ApprovalResult,
  AuditEntry,
  RateLimitConfig,
  RateLimitStatus,
  ElementContext,
} from "./types/safety.js";

export {
  getBaseSideEffectLevel,
  assessRisk,
  describeAction,
  RateLimiter,
  AuditLog,
} from "./safety.js";

export {
  Logger,
  createNodeLogger,
  createExtensionLogger,
  initExtensionDebug,
} from "./logger.js";

export type { LogLevel } from "./logger.js";
