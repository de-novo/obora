import { useCallback, useEffect, useMemo, useState } from 'react';

import { deletePolicy, getPolicy, listPolicies, type PolicyDocument } from '../api/policy-client';
import { PolicyList } from '../components/PolicyList';
import { YamlEditor } from '../components/YamlEditor';

export const PolicyEditor = (): JSX.Element => {
  const [policies, setPolicies] = useState<PolicyDocument[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | undefined>(undefined);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyDocument | undefined>(undefined);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingPolicy, setIsLoadingPolicy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const loadPolicies = useCallback(async (): Promise<void> => {
    setIsLoadingList(true);
    setErrorMessage(undefined);
    try {
      const list = await listPolicies();
      setPolicies(list);
      if (!selectedPolicyId && list.length > 0) {
        setSelectedPolicyId(list[0]?.id);
      }
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : '정책 목록 조회에 실패했습니다.');
    } finally {
      setIsLoadingList(false);
    }
  }, [selectedPolicyId]);

  useEffect(() => {
    void loadPolicies();
  }, [loadPolicies]);

  useEffect(() => {
    if (!selectedPolicyId) {
      setSelectedPolicy(undefined);
      return;
    }

    setIsLoadingPolicy(true);
    setErrorMessage(undefined);

    getPolicy(selectedPolicyId)
      .then((policy) => {
        setSelectedPolicy(policy);
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : '정책 로드에 실패했습니다.');
      })
      .finally(() => {
        setIsLoadingPolicy(false);
      });
  }, [selectedPolicyId]);

  const editorPolicy = useMemo(() => {
    if (!selectedPolicyId) {
      return undefined;
    }
    return selectedPolicy;
  }, [selectedPolicy, selectedPolicyId]);

  const handleDeletePolicy = async (policy: PolicyDocument): Promise<void> => {
    try {
      await deletePolicy(policy.id);
      const list = await listPolicies();
      setPolicies(list);

      if (selectedPolicyId === policy.id) {
        setSelectedPolicyId(list[0]?.id);
      }
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : '정책 삭제에 실패했습니다.');
    }
  };

  return (
    <section
      style={{
        border: '1px solid #ddd',
        borderRadius: '12px',
        minHeight: '520px',
        backgroundColor: '#fafafa',
        display: 'flex',
      }}
    >
      <PolicyList
        policies={policies}
        selectedPolicyId={selectedPolicyId}
        isLoading={isLoadingList}
        onSelectPolicy={setSelectedPolicyId}
        onCreatePolicy={() => {
          setSelectedPolicyId(undefined);
          setSelectedPolicy(undefined);
        }}
        onDeletePolicy={(policy) => {
          void handleDeletePolicy(policy);
        }}
      />

      <div style={{ flex: 1, padding: '16px' }}>
        {isLoadingPolicy ? <p>정책 로딩 중...</p> : null}
        {errorMessage ? <p style={{ color: '#dc2626' }}>{errorMessage}</p> : null}

        <YamlEditor
          policy={editorPolicy}
          onSaved={(savedPolicy, mode) => {
            setSelectedPolicy(savedPolicy);
            setSelectedPolicyId(savedPolicy.id);

            setPolicies((previous) => {
              if (mode === 'create') {
                return [...previous, savedPolicy];
              }

              return previous.map((item) => (item.id === savedPolicy.id ? savedPolicy : item));
            });
          }}
        />
      </div>
    </section>
  );
};
