import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/localApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft } from 'lucide-react';
import AuthLayout from '@/components/Authlayout.jsx';

export default function Verify() {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Get email from URL search params if available
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get('email');
    if (emailParam) setEmail(emailParam);
  }, []);

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.auth.verifyOtp({ email, token });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={null} 
      title="Verify your email"
      subtitle="Enter the 6-digit code sent to your email address"
      footer={
        <button 
          onClick={() => navigate('/register')} 
          className="text-sm text-muted-foreground hover:text-link flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" /> Back to registration
        </button>
      }
    >
      <form onSubmit={handleVerify} className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="token">Verification Code</Label>
            <Input
              id="token"
              type="text"
              placeholder="123456"
              maxLength={6}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              className="text-center text-2xl tracking-widest font-mono"
            />
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full h-12 text-[15px] font-bold" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Verifying...
            </>
          ) : (
            "Verify Account"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
