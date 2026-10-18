import React from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

export default function ProgressRing({ renderedHours, totalHours }) {
    const percentage = Math.round((renderedHours / totalHours) * 100) || 0;

    return (
        <div className="bg-cardBg border border-cardBorder p-6 rounded-2xl flex flex-col items-center justify-center relative shadow-lg backdrop-blur-md">
            <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-4">Rendering Progress</h3>

            <div className="w-40 h-40 relative">
                <CircularProgressbar
                    value={percentage}
                    text={`${renderedHours} / ${totalHours}`}
                    styles={buildStyles({
                        textSize: '14px',
                        pathColor: '#6366F1',
                        textColor: '#FFFFFF',
                        trailColor: '#1E293B',
                        strokeLinecap: 'round',
                        pathTransitionDuration: 0.5,
                    })}
                />
            </div>

            <p className="text-indigo-400 text-sm font-medium mt-4">
                {percentage}% Completed
            </p>
        </div>
    );
}