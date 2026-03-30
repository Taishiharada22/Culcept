"use client";

// hooks/useSignalCollector.ts
// 行動シグナルコレクターのReactフック
//
// SignalCollectorをコンポーネントライフサイクルに統合する。
// mount時にインスタンス生成、unmount時にdestroy。

import { useRef, useCallback, useEffect } from "react";
import {
  SignalCollector,
  type BehavioralSignal,
  type QuestionInsight,
  type SessionSignals,
} from "@/lib/stargazer/behavioralSignalCollector";

export function useSignalCollector() {
  const collectorRef = useRef<SignalCollector | null>(null);

  useEffect(() => {
    collectorRef.current = new SignalCollector();
    return () => {
      collectorRef.current?.destroy();
      collectorRef.current = null;
    };
  }, []);

  const startQuestion = useCallback((questionId: string) => {
    collectorRef.current?.startQuestion(questionId);
  }, []);

  const onOptionHover = useCallback((optionValue: string) => {
    collectorRef.current?.onOptionHover(optionValue);
  }, []);

  const onOptionHoverEnd = useCallback((optionValue: string) => {
    collectorRef.current?.onOptionHoverEnd(optionValue);
  }, []);

  const recordScrollback = useCallback(() => {
    collectorRef.current?.recordScrollback();
  }, []);

  const recordAnswer = useCallback(
    (questionId: string, selectedOption: string): BehavioralSignal | null => {
      return collectorRef.current?.recordAnswer(questionId, selectedOption) ?? null;
    },
    [],
  );

  const recordAnswerChange = useCallback(
    (questionId: string, newOption: string, previousOption: string): void => {
      collectorRef.current?.recordAnswerChange(questionId, newOption, previousOption);
    },
    [],
  );

  const getQuestionInsight = useCallback(
    (signal: BehavioralSignal): QuestionInsight | null => {
      return collectorRef.current?.getQuestionInsight(signal) ?? null;
    },
    [],
  );

  const getSessionSignals = useCallback((): SessionSignals | null => {
    return collectorRef.current?.getSessionSignals() ?? null;
  }, []);

  const saveSession = useCallback(() => {
    collectorRef.current?.saveSession();
  }, []);

  return {
    startQuestion,
    onOptionHover,
    onOptionHoverEnd,
    recordScrollback,
    recordAnswer,
    recordAnswerChange,
    getQuestionInsight,
    getSessionSignals,
    saveSession,
  };
}
