import { useRef, useState, type InputHTMLAttributes } from "react";
import { Field } from "../../components/ui";
import { currencies, currencyNames, homeCurrencies } from "../../lib/domain";
import type { Bundle, Editor, Revision } from "../../lib/types";

export interface EditorActions {
  close: () => void;
  saved: (tid?: string) => Promise<void>;
  reload: () => Promise<void>;
}
export type FormProps<K extends Editor["kind"]> = EditorActions & {
  editor: Extract<Editor, { kind: K }>;
  data: Bundle;
};
type StringKey<T> = {
  [K in keyof T]: T[K] extends string ? K : never;
}[keyof T] &
  string;

/** Small typed state helper. Domain validation and submission stay in each form. */
export function useDraft<T>(initial: T, revision?: Revision) {
  const [v, set] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const version = useRef(revision).current;
  function change<K extends keyof T>(key: K, value: T[K]) {
    set((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }
  function input<K extends StringKey<T>>(
    key: K,
    props: InputHTMLAttributes<HTMLInputElement> = {},
  ) {
    return (
      <input
        {...props}
        name={key}
        value={String(v[key])}
        onChange={(e) => change(key, e.target.value as T[K])}
      />
    );
  }
  function select<K extends StringKey<T>>(
    key: K,
    options: Record<string, string>,
  ) {
    return (
      <select
        name={key}
        value={String(v[key])}
        onChange={(e) => change(key, e.target.value as T[K])}
      >
        {Object.entries(options).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    );
  }
  function ccy<K extends StringKey<T>>(key: K, home = false) {
    return select(
      key,
      Object.fromEntries(
        (home ? homeCurrencies : currencies).map((c) => [
          c,
          `${c} · ${currencyNames[c]}`,
        ]),
      ),
    );
  }
  function amount<K extends StringKey<T>>(key: K, required = true) {
    return input(key, {
      type: "number",
      inputMode: "decimal",
      min: key === "amount" ? ".01" : "0",
      max: 999999999999,
      step: ".01",
      required,
    });
  }
  return { v, change, input, select, ccy, amount, dirty, version };
}

export function PlaceFields({
  value,
  onChange,
}: {
  value: { place: string; locality: string; google_id: string };
  onChange: (key: "place" | "locality" | "google_id", value: string) => void;
}) {
  return (
    <>
      <Field label="地點名稱">
        <input
          name="place"
          maxLength={240}
          value={value.place}
          placeholder="例如：清水寺"
          onChange={(e) => onChange("place", e.target.value)}
        />
      </Field>
      <Field label="城市或地址">
        <input
          name="locality"
          maxLength={240}
          value={value.locality}
          placeholder="例如：京都"
          onChange={(e) => onChange("locality", e.target.value)}
        />
      </Field>
      <details className="advanced wide">
        <summary>精確地點設定（選填）</summary>
        <Field label="Google Place ID" hint="未填則以名稱搜尋。">
          <input
            name="google_id"
            maxLength={240}
            value={value.google_id}
            onChange={(e) => onChange("google_id", e.target.value)}
          />
        </Field>
      </details>
    </>
  );
}
export function NotesField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="備註" wide>
      <textarea
        name="notes"
        rows={3}
        maxLength={4000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
