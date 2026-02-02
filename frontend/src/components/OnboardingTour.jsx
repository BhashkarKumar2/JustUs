
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const steps = [
    {
        target: '.profile-btn',
        title: 'Your Profile & Contacts',
        content: 'Click your name here to update your profile or switch contacts.',
        position: 'bottom-left'
    },
    {
        target: '.bot-toggle-btn',
        title: 'AI Companion',
        content: 'Tap the sparkle icon to toggle our advanced AI assistant.',
        position: 'top-left'
    },
    {
        target: 'button[title="More options"]',
        title: 'More Options',
        content: 'Use this menu to search messages or customize your wallpaper.',
        position: 'bottom-right'
    }
];

export default function OnboardingTour({ isOpen, onClose }) {
    const [currentStep, setCurrentStep] = useState(0);
    const [coords, setCoords] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (!isOpen) return;

        const updatePosition = () => {
            const step = steps[currentStep];
            const element = document.querySelector(step.target);

            if (element) {
                const rect = element.getBoundingClientRect();

                // Smart Positioning
                let top;
                const tooltipHeight = 200; // Approx max height
                const spaceBelow = window.innerHeight - rect.bottom;

                // If not enough space below, flip to top
                if (spaceBelow < tooltipHeight) {
                    top = rect.top - tooltipHeight + 20; // Place above
                } else {
                    top = rect.bottom + 10; // Place below
                }

                let left = rect.left;

                // Adjust for screen edges
                if (left + 300 > window.innerWidth) {
                    left = window.innerWidth - 320;
                }

                // Ensure it doesn't go off left edge
                if (left < 10) left = 10;

                setCoords({ top, left });
            }
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true); // Capture scroll on all elements

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [isOpen, currentStep]);

    if (!isOpen) return null;

    const step = steps[currentStep];

    return createPortal(
        <div className="fixed inset-0 z-[9999] pointer-events-none">
            {/* Backdrop with hole highlight approach is complex without libs, 
          so we use a semi-transparent dark overlay for simplicity and performance */}
            <div className="absolute inset-0 bg-black/50 pointer-events-auto" />

            {/* Tooltip Card */}
            <div
                className="absolute bg-white dark:bg-gray-800 p-5 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-[280px] pointer-events-auto transition-all duration-300 ease-out"
                style={{
                    top: coords.top,
                    left: coords.left,
                    animation: 'fadeInUp 0.3s ease-out'
                }}
            >
                <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-indigo-500 uppercase tracking-wider">
                        Tip {currentStep + 1} of {steps.length}
                    </span>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        ✕
                    </button>
                </div>

                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                    {step.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                    {step.content}
                </p>

                <div className="flex justify-between mt-2">
                    {currentStep > 0 ? (
                        <button
                            onClick={() => setCurrentStep(prev => prev - 1)}
                            className="text-sm font-medium text-gray-500 hover:text-indigo-500 transition-colors"
                        >
                            Back
                        </button>
                    ) : <div></div>}

                    <button
                        onClick={() => {
                            if (currentStep < steps.length - 1) {
                                setCurrentStep(prev => prev + 1);
                            } else {
                                onClose();
                            }
                        }}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-lg shadow-indigo-500/30 transition-all hover:scale-105"
                    >
                        {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
