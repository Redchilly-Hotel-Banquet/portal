"use client";

import type { Dispatch } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Field } from "../field";
import type { CheckinAction, CheckinFormState } from "./use-checkin-form";

export function ArrivalStep({ state, dispatch }: { state: CheckinFormState; dispatch: Dispatch<CheckinAction> }) {
  const send = dispatch;
  return (
    <div className="space-y-6">
      <Field
        id="expected-arrival"
        label="Expected arrival"
        optional
        hint="Helps the front desk have your room ready."
        className="max-w-sm"
      >
        <Input
          id="expected-arrival"
          type="datetime-local"
          value={state.expectedArrival}
          onChange={(e) => send({ type: "setField", field: "expectedArrival", value: e.target.value })}
          aria-describedby="expected-arrival-hint"
        />
      </Field>

      <div className="space-y-3 border-y border-border py-5">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="needs-assistance" className="text-sm">
            A guest needs special assistance
            <span className="block text-xs font-normal text-muted-foreground">
              Mobility, dietary or medical requirements.
            </span>
          </Label>
          <Switch
            id="needs-assistance"
            checked={state.needsAssistance}
            onCheckedChange={(value) => send({ type: "setAssistance", value })}
          />
        </div>
        {state.needsAssistance && (
          <Field id="assistance-details" label="Assistance details">
            <Textarea
              id="assistance-details"
              rows={3}
              value={state.assistanceDetails}
              onChange={(e) => send({ type: "setField", field: "assistanceDetails", value: e.target.value })}
            />
          </Field>
        )}
      </div>

      <Field
        id="other-requests"
        label="Other requests"
        optional
        hint="Late check-out, floor or room preference, celebrations."
      >
        <Textarea
          id="other-requests"
          rows={3}
          value={state.otherRequests}
          onChange={(e) => send({ type: "setField", field: "otherRequests", value: e.target.value })}
          aria-describedby="other-requests-hint"
        />
      </Field>
    </div>
  );
}
