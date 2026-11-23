import { mock } from "bun:test"

import * as obsidianStub from "./obsidian-stub"

/*
 * The `obsidian` package ships types only, so tests load this stub in its
 * place.
 */
void mock.module("obsidian", () => obsidianStub)
