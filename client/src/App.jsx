import { useState, useRef, useEffect } from 'react';

const REFUSAL_RE = /can't find|cannot find|not found|not in your documents/i;

const SUGGESTED_QUESTIONS = [
  "The provider billed me $160 -- do I owe it?",
  "The doctor is threatening collections -- am I protected?",
  "How close am I to my in-network deductible?",
  "What is my dental copay?",
];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dots, setDots] = useState(1);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setDots(d => (d === 3 ? 1 : d + 1)), 450);
    return () => clearInterval(id);
  }, [loading]);

  async function submit(text) {
    const question = (text ?? input).trim();
    if (!question) return;

    setError(null);
    const userMsg = { id: crypto.randomUUID(), role: 'user', text: question };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) throw new Error('Server returned ' + res.status);
      const data = await res.json();
      const isRefusal = REFUSAL_RE.test(data.answer ?? '');
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'bot',
          text: data.answer,
          citations: data.citations ?? [],
          isRefusal,
          isError: false,
          faithfulnessScore: data.faithfulnessScore ?? null,
        },
      ]);
    } catch {
      setError('Could not reach the server. Please try again.');
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'bot',
          text: 'Sorry, something went wrong. Please try again.',
          citations: [],
          isRefusal: false,
          isError: true,
          faithfulnessScore: null,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#f0f4f8',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <header
        style={{
          backgroundColor: '#1a3a5c',
          color: '#ffffff',
          padding: '1rem',
          fontSize: '1.1rem',
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        EOB Chatbot
      </header>

      {error && (
        <div
          style={{
            backgroundColor: '#dc2626',
            color: '#ffffff',
            padding: '0.625rem 1rem',
            fontSize: '0.875rem',
            flexShrink: 0,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
        }}
      >
        {messages.map(msg => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: '0.75rem',
            }}
          >
            <div
              style={{
                maxWidth: '72%',
                padding: '0.75rem 1rem',
                borderRadius: '1rem',
                backgroundColor: msg.role === 'user' ? '#f0f4f8' : '#ffffff',
                border:
                  msg.role === 'user'
                    ? '1px solid #cbd5e1'
                    : '1px solid #e2e8f0',
                color: msg.isError ? '#dc2626' : '#1e293b',
                fontSize: '0.95rem',
                lineHeight: '1.5',
              }}
            >
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.text}</p>

              {msg.role === 'bot' &&
                !msg.isRefusal &&
                msg.citations?.length > 0 && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      paddingTop: '0.75rem',
                      borderTop: '1px solid #e2e8f0',
                    }}
                  >
                    <p
                      style={{
                        margin: '0 0 0.5rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Sources
                    </p>
                    {msg.citations.map((c, i) => (
                      <div key={i} style={{ marginBottom: '0.5rem' }}>
                        <p
                          style={{
                            margin: '0 0 0.25rem',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#1a3a5c',
                          }}
                        >
                          {c.source ?? c.filename}
                        </p>
                        <p
                          style={{
                            margin: 0,
                            fontSize: '0.8rem',
                            color: '#475569',
                            fontStyle: 'italic',
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                          }}
                        >
                          {c.excerpt}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

              {msg.role === 'bot' && msg.isRefusal && (
                <div
                  style={{
                    display: 'inline-block',
                    marginTop: '0.625rem',
                    padding: '0.25rem 0.75rem',
                    backgroundColor: '#f59e0b',
                    color: '#92400e',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  No matching records found
                </div>
              )}

              {msg.role === 'bot' && !msg.isRefusal && !msg.isError &&
                msg.faithfulnessScore != null && msg.faithfulnessScore >= 0.8 && (
                  <div
                    style={{
                      display: 'inline-block',
                      marginTop: '0.625rem',
                      padding: '0.25rem 0.75rem',
                      backgroundColor: '#16a34a',
                      color: '#ffffff',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    Verified against your documents
                  </div>
                )}
            </div>
          </div>
        ))}

        {loading && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-start',
              marginBottom: '0.75rem',
            }}
          >
            <div
              style={{
                maxWidth: '72%',
                padding: '0.75rem 1rem',
                borderRadius: '1rem',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
              }}
            >
              <span
                style={{
                  color: '#64748b',
                  fontSize: '1.1rem',
                  letterSpacing: '0.1em',
                }}
              >
                {'•'.repeat(dots)}
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {messages.length === 0 && !loading && (
        <div
          style={{
            padding: '0.75rem 1rem',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.5rem',
            flexShrink: 0,
          }}
        >
          {SUGGESTED_QUESTIONS.map(q => (
            <button
              key={q}
              onClick={() => submit(q)}
              style={{
                padding: '0.5rem 0.75rem',
                backgroundColor: '#ffffff',
                border: '1px solid #0891b2',
                borderRadius: '0.5rem',
                color: '#0f172a',
                cursor: 'pointer',
                fontSize: '0.8rem',
                textAlign: 'left',
                lineHeight: '1.4',
                fontFamily: 'inherit',
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          padding: '0.75rem 1rem',
          backgroundColor: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          flexShrink: 0,
        }}
      >
        <textarea
          rows={1}
          value={input}
          disabled={loading}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask about your EOB..."
          style={{
            flex: 1,
            resize: 'none',
            border: '1px solid #cbd5e1',
            borderRadius: '0.5rem',
            padding: '0.625rem 0.75rem',
            fontSize: '0.95rem',
            outline: 'none',
            backgroundColor: loading ? '#f8fafc' : '#ffffff',
            fontFamily: 'inherit',
            lineHeight: '1.5',
          }}
        />
        <button
          onClick={() => submit()}
          disabled={loading}
          style={{
            marginLeft: '0.5rem',
            padding: '0.625rem 1.25rem',
            backgroundColor: loading ? '#94a3b8' : '#1a3a5c',
            color: '#ffffff',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '0.95rem',
            fontFamily: 'inherit',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
