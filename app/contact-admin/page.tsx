'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, Phone, User, Shield, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ContactAdminPage() {
  return (
    <div className='flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background to-muted/20 p-4'>
      <div className='mb-8 text-center animate-fade-in'>
        <div className='mb-6 flex justify-center'>
          <div className='h-16 w-16 flex items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg'>
            <span className='text-primary-foreground font-bold text-2xl'>J</span>
          </div>
        </div>
        <h1 className='text-display mb-2'>JKKN COE</h1>
        <p className='text-subheading'>Controller of Examination</p>
      </div>
      
      <Card className='w-full max-w-2xl shadow-xl hover:shadow-2xl transition-all duration-300 animate-scale-in'>
        <CardHeader className='text-center pb-4'>
          <CardTitle className='text-heading flex items-center justify-center gap-2'>
            <Shield className='h-6 w-6' />
            Contact Administrator
          </CardTitle>
          <CardDescription className='text-body'>
            Request access to the JKKN COE system
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          {/* Information Card */}
          <div className='bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800'>
            <div className='flex items-start gap-3'>
              <User className='h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5' />
              <div>
                <h3 className='font-medium text-blue-800 dark:text-blue-200 mb-2'>
                  Account Access Required
                </h3>
                <p className='text-sm text-blue-700 dark:text-blue-300'>
                  User accounts in the JKKN COE system are managed by administrators only. 
                  New users cannot self-register and must be added by authorized personnel.
                </p>
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className='space-y-4'>
            <h3 className='font-medium text-lg'>Contact Information</h3>
            
            <div className='grid gap-4 md:grid-cols-2'>
              <div className='flex items-center gap-3 p-3 rounded-lg bg-muted/50'>
                <Mail className='h-5 w-5 text-primary' />
                <div>
                  <p className='font-medium'>Email</p>
                  <p className='text-sm text-muted-foreground'>admin@jkkn.ac.in</p>
                </div>
              </div>

              <div className='flex items-center gap-3 p-3 rounded-lg bg-muted/50'>
                <Phone className='h-5 w-5 text-primary' />
                <div>
                  <p className='font-medium'>Phone</p>
                  <p className='text-sm text-muted-foreground'>+91-XXX-XXXX-XXXX</p>
                </div>
              </div>
            </div>
          </div>

          {/* Required Information */}
          <div className='space-y-4'>
            <h3 className='font-medium text-lg'>Information to Provide</h3>
            <div className='space-y-2'>
              <div className='flex items-center gap-2'>
                <Badge variant='outline'>Full Name</Badge>
                <span className='text-sm text-muted-foreground'>Your complete name</span>
              </div>
              <div className='flex items-center gap-2'>
                <Badge variant='outline'>Email Address</Badge>
                <span className='text-sm text-muted-foreground'>Preferred email for login</span>
              </div>
              <div className='flex items-center gap-2'>
                <Badge variant='outline'>Department</Badge>
                <span className='text-sm text-muted-foreground'>Your department or role</span>
              </div>
              <div className='flex items-center gap-2'>
                <Badge variant='outline'>Purpose</Badge>
                <span className='text-sm text-muted-foreground'>Why you need access to COE system</span>
              </div>
            </div>
          </div>

          {/* Process Information */}
          <div className='space-y-4'>
            <h3 className='font-medium text-lg'>Account Creation Process</h3>
            <div className='space-y-3'>
              <div className='flex items-start gap-3'>
                <div className='flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium'>
                  1
                </div>
                <p className='text-sm'>Contact the JKKN COE Administrator with your information</p>
              </div>
              <div className='flex items-start gap-3'>
                <div className='flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium'>
                  2
                </div>
                <p className='text-sm'>Administrator will verify your identity and requirements</p>
              </div>
              <div className='flex items-start gap-3'>
                <div className='flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium'>
                  3
                </div>
                <p className='text-sm'>Account will be created with appropriate permissions</p>
              </div>
              <div className='flex items-start gap-3'>
                <div className='flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium'>
                  4
                </div>
                <p className='text-sm'>Login credentials will be provided to you</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className='flex flex-col sm:flex-row gap-3 pt-4'>
            <Button asChild className='flex-1'>
              <Link href='/login'>
                <ArrowLeft className='mr-2 h-4 w-4' />
                Back to Login
              </Link>
            </Button>
            <Button variant='outline' className='flex-1' asChild>
              <a href='mailto:admin@jkkn.ac.in?subject=JKKN COE Access Request'>
                <Mail className='mr-2 h-4 w-4' />
                Send Email
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <footer className='mt-12 text-center animate-fade-in' style={{ animationDelay: '0.3s' }}>
        <div className='max-w-md'>
          <p className='text-caption'>
            This is the Controller of Examination application with administrator-managed user accounts
            for secure and controlled access.
          </p>
        </div>
      </footer>
    </div>
  );
}
