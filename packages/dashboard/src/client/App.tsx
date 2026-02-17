export const App = (): JSX.Element => {
  return (
    <main style={{ padding: '24px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>Obora Dashboard</h1>
        <p style={{ marginTop: '8px', color: '#666' }}>M4 운영 관찰성 UI 표준 진입점</p>
      </header>

      <section
        style={{
          border: '1px solid #ddd',
          borderRadius: '12px',
          minHeight: '320px',
          padding: '16px',
          backgroundColor: '#fafafa',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Panel</h2>
        <p style={{ color: '#888' }}>실행 타임라인/상세 패널이 여기에 연결됩니다.</p>
      </section>
    </main>
  );
};
