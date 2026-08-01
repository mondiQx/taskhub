import type { NewTaskInput } from "../types.js";

export interface Connector {
  name: string;
  poll(): Promise<NewTaskInput[]>;
}
