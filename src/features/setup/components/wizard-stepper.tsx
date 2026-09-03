"use client"

import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

interface WizardStepperProps {
  steps: { label: string; icon: React.ReactNode }[]
  currentStep: number
}

export function WizardStepper({ steps, currentStep }: WizardStepperProps) {
  // Sete passos não cabem em tela estreita: a trilha rola na horizontal em vez de espremer os círculos.
  return (
    <div className="flex items-center justify-center gap-0 w-full max-w-2xl mx-auto py-6 px-4 overflow-x-auto">
      {steps.map((step, index) => {
        const isCompleted = index < currentStep
        const isCurrent = index === currentStep
        const isLast = index === steps.length - 1

        return (
          <div key={index} className="flex items-center shrink-0">
            {/* Step circle */}
            <div className="flex flex-col items-center gap-2 min-w-[60px]">
              <div
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300",
                  isCompleted && "bg-primary border-primary text-primary-foreground",
                  isCurrent && "border-primary bg-primary/10 text-primary scale-110 shadow-md shadow-primary/20",
                  !isCompleted && !isCurrent && "border-muted-foreground/30 text-muted-foreground/50"
                )}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <span className="text-sm font-medium">{step.icon}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium text-center leading-tight hidden sm:block",
                  isCurrent && "text-primary",
                  isCompleted && "text-primary/70",
                  !isCompleted && !isCurrent && "text-muted-foreground/50"
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div
                className={cn(
                  "h-0.5 w-8 sm:w-12 mx-1 shrink-0 transition-all duration-500",
                  isCompleted ? "bg-primary" : "bg-muted-foreground/20"
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
