import type { PolicyDocument } from '../api/policy-client';

interface PolicyListProps {
  policies: PolicyDocument[];
  selectedPolicyId?: string;
  isLoading?: boolean;
  onSelectPolicy: (policyId: string) => void;
  onCreatePolicy: () => void;
  onDeletePolicy: (policy: PolicyDocument) => void;
}

export const PolicyList = ({
  policies,
  selectedPolicyId,
  isLoading = false,
  onSelectPolicy,
  onCreatePolicy,
  onDeletePolicy,
}: PolicyListProps): JSX.Element => {
  return (
    <aside
      style={{
        width: '280px',
        borderRight: '1px solid #e5e7eb',
        backgroundColor: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '12px', borderBottom: '1px solid #e5e7eb' }}>
        <button
          type="button"
          onClick={onCreatePolicy}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #2563eb',
            backgroundColor: '#2563eb',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          + 새 정책
        </button>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {isLoading ? <p style={{ padding: '12px' }}>정책 목록 로딩 중...</p> : null}
        {!isLoading && policies.length === 0 ? <p style={{ padding: '12px' }}>정책이 없습니다.</p> : null}

        {!isLoading
          ? policies.map((policy) => {
              const isSelected = policy.id === selectedPolicyId;
              return (
                <div
                  key={policy.id}
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid #e5e7eb',
                    backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectPolicy(policy.id)}
                    style={{
                      border: 'none',
                      background: 'none',
                      textAlign: 'left',
                      width: '100%',
                      cursor: 'pointer',
                    }}
                  >
                    <strong style={{ display: 'block' }}>{policy.name}</strong>
                    <span style={{ color: '#64748b', fontSize: '12px' }}>rev {policy.revision}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`정책 "${policy.name}"을(를) 삭제하시겠습니까?`)) {
                        onDeletePolicy(policy);
                      }
                    }}
                    style={{
                      marginTop: '8px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid #dc2626',
                      color: '#dc2626',
                      backgroundColor: '#fff',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    삭제
                  </button>
                </div>
              );
            })
          : null}
      </div>
    </aside>
  );
};
