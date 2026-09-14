"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { readData } from "@/db";
export function useFinance() {
  return useLiveQuery(readData, []);
}
