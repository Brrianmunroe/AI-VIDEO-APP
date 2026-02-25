import React, { useState } from 'react';
import Button from '../components/Button';
import TextInput from '../components/TextInput';
import { useAuth } from '../contexts/AuthContext';
import './styles/Login.css';

export default function Login() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password);
        setError('Account created! Check your email to confirm, or sign in.');
        setIsSignUp(false);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err?.message ?? (isSignUp ? 'Sign up failed' : 'Sign in failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err?.message ?? 'Google sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <div className="login__card">
        <h2 className="login__heading">{isSignUp ? 'Create an account' : 'Sign in to continue'}</h2>

        <form className="login__form" onSubmit={handleSubmit}>
          <TextInput
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <TextInput
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <p className="login__error" role="alert">{error}</p>}
          <Button
            type="submit"
            variant="primary"
            disabled={loading}
            className="login__submit"
          >
            {loading ? (isSignUp ? 'Creating…' : 'Signing in…') : (isSignUp ? 'Create account' : 'Sign in')}
          </Button>
          <button
            type="button"
            className="login__toggle"
            onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
          </button>
        </form>

        <div className="login__divider">
          <span>or</span>
        </div>

        <Button
          variant="secondary"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="login__google"
        >
          Sign in with Google
        </Button>
      </div>
    </div>
  );
}
