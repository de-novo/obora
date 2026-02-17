interface BlackboardSnapshotProps {
  value: unknown;
  changedPaths: Set<string>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const renderPrimitive = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
};

const NodeView = ({ value, path, changedPaths }: { value: unknown; path: string; changedPaths: Set<string> }): JSX.Element => {
  if (Array.isArray(value)) {
    return (
      <ul style={{ margin: '4px 0 4px 16px', padding: 0 }}>
        {value.map((item, index) => {
          const itemPath = path ? `${path}.${index}` : String(index);
          const changed = changedPaths.has(itemPath);
          return (
            <li key={itemPath} style={{ listStyle: 'none' }}>
              <span style={{ backgroundColor: changed ? '#fef3c7' : 'transparent', padding: '1px 2px' }}>
                [{index}] {isObject(item) || Array.isArray(item) ? '' : renderPrimitive(item)}
              </span>
              {isObject(item) || Array.isArray(item) ? (
                <NodeView value={item} path={itemPath} changedPaths={changedPaths} />
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  if (isObject(value)) {
    return (
      <ul style={{ margin: '4px 0 4px 16px', padding: 0 }}>
        {Object.entries(value).map(([key, child]) => {
          const childPath = path ? `${path}.${key}` : key;
          const changed = changedPaths.has(childPath);
          return (
            <li key={childPath} style={{ listStyle: 'none' }}>
              <span style={{ fontWeight: 600 }}>{key}</span>
              {isObject(child) || Array.isArray(child) ? ':' : ' = '}
              {!isObject(child) && !Array.isArray(child) ? (
                <span style={{ backgroundColor: changed ? '#fef3c7' : 'transparent', padding: '1px 2px' }}>
                  {renderPrimitive(child)}
                </span>
              ) : null}
              {isObject(child) || Array.isArray(child) ? (
                <div style={{ backgroundColor: changed ? '#fef3c7' : 'transparent' }}>
                  <NodeView value={child} path={childPath} changedPaths={changedPaths} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return <pre style={{ margin: 0 }}>{renderPrimitive(value)}</pre>;
};

export const BlackboardSnapshot = ({ value, changedPaths }: BlackboardSnapshotProps): JSX.Element => {
  if (value === undefined) {
    return <p style={{ margin: 0, color: '#6b7280' }}>Blackboard 데이터가 없습니다.</p>;
  }

  return <NodeView value={value} path="" changedPaths={changedPaths} />;
};
