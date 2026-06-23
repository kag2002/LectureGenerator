'use client';

import React from 'react';

interface ParsingProgressBarProps {
  loading: boolean;
  streamStage: number;
  streamLog: string;
}

export default function ParsingProgressBar({
  loading,
  streamStage,
  streamLog
}: ParsingProgressBarProps) {
  if (!loading || streamStage <= 0) return null;

  const percentage = Math.round((streamStage / 4) * 100);

  return (
    <div className="course-config-progress-container">
      <div className="course-config-progressbar-wrapper">
        <div
          className={`course-config-progressbar ${streamStage === 4 ? 'course-config-progressbar--success' : ''}`}
          style={{ width: `${(streamStage / 4) * 100}%` }}
        />
      </div>
      <div className="course-config-progress-text">
        <span>Giai đoạn {streamStage}/4</span>
        <span>{percentage}%</span>
      </div>
      {streamLog && (
        <div className="course-config-stream-log-text">
          <span className="course-config-pulse-dot" /> {streamLog}
        </div>
      )}
    </div>
  );
}
