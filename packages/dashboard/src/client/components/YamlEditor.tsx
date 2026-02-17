import { useEffect, useRef, useState } from 'react';

import {
  createPolicy,
  type PolicyDocument,
  PolicyApiError,
  type PolicyValidationResult,
  updatePolicy,
  validatePolicy,
} from '../api/policy-client';

interface YamlEditorProps {
  policy?: PolicyDocument;
  onSaved: (policy: PolicyDocument, mode: 'create' | 'update') => void;
}

const EMPTY_VALIDATION: PolicyValidationResult = { valid: true, errors: [] };

export const YamlEditor = ({ policy, onSaved }: YamlEditorProps): JSX.Element => {
  const [name, setName] = useState<string>(policy?.name ?? '');
  const [content, setContent] = useState<string>(policy?.content ?? '');
  const [baseRevision, setBaseRevision] = useState<string | undefined>(policy?.revision);

  const [validation, setValidation] = useState<PolicyValidationResult>(EMPTY_VALIDATION);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setName(policy?.name ?? '');
    setContent(policy?.content ?? '');
    setBaseRevision(policy?.revision);
    setValidation(EMPTY_VALIDATION);
    setSaveError(undefined);
  }, [policy]);

  useEffect(() => {
    if (!content.trim()) {
      setValidation(EMPTY_VALIDATION);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setIsValidating(true);
      validatePolicy(content)
        .then((result) => {
          setValidation(result);
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : '검증 중 알 수 없는 오류가 발생했습니다.';
          setValidation({ valid: false, errors: [message] });
        })
        .finally(() => {
          setIsValidating(false);
        });
    }, 350);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [content]);

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    setSaveError(undefined);

    try {
      if (policy) {
        if (!baseRevision) {
          throw new Error('현재 revision 정보가 없습니다. 목록에서 정책을 다시 선택해 주세요.');
        }

        const updated = await updatePolicy(policy.id, {
          name,
          content,
          revision: baseRevision,
        });
        setBaseRevision(updated.revision);
        onSaved(updated, 'update');
        return;
      }

      const created = await createPolicy({
        name: name.trim() || 'untitled-policy',
        content,
      });
      setBaseRevision(created.revision);
      onSaved(created, 'create');
    } catch (error: unknown) {
      if (error instanceof PolicyApiError && error.isRevisionConflict) {
        setSaveError('저장 충돌이 발생했습니다(409). 최신 정책을 다시 불러온 뒤 저장해 주세요.');
      } else {
        setSaveError(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const validationColor = validation.valid ? '#16a34a' : '#dc2626';

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <label htmlFor="policy-name" style={{ minWidth: '70px', fontWeight: 600 }}>
          이름
        </label>
        <input
          id="policy-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="policy name"
          style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving || !content.trim()}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #2563eb',
            backgroundColor: '#2563eb',
            color: '#fff',
            cursor: isSaving ? 'wait' : 'pointer',
          }}
        >
          {isSaving ? '저장 중...' : '저장'}
        </button>
      </div>

      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="YAML 정책을 입력하세요"
        spellCheck={false}
        style={{
          flex: 1,
          minHeight: '360px',
          borderRadius: '10px',
          border: '1px solid #cbd5e1',
          padding: '12px',
          resize: 'vertical',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: '13px',
          lineHeight: 1.5,
          backgroundColor: '#fff',
        }}
      />

      <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 10px', backgroundColor: '#f8fafc' }}>
        <p style={{ margin: 0, color: validationColor, fontWeight: 600 }}>
          {isValidating ? '검증 중...' : validation.valid ? '유효한 정책입니다.' : '유효하지 않은 정책입니다.'}
        </p>
        {!validation.valid && validation.errors.length > 0 ? (
          <ul style={{ margin: '6px 0 0 18px', color: '#dc2626' }}>
            {validation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {saveError ? <p style={{ margin: 0, color: '#dc2626' }}>{saveError}</p> : null}
      {policy ? <p style={{ margin: 0, color: '#64748b', fontSize: '12px' }}>현재 revision: {baseRevision}</p> : null}
    </section>
  );
};
