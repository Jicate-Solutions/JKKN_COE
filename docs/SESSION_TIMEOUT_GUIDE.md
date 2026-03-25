# Session Timeout Implementation Guide

## 🔒 Overview

The JKKN COE application now includes comprehensive session timeout functionality that automatically logs out users after a period of inactivity. This enhances security by preventing unauthorized access to accounts.

## ⚙️ Features Implemented

### 1. **Automatic Session Timeout** ✅
- **Default Duration**: 15 minutes of inactivity
- **Configurable**: Can be adjusted per application needs
- **Automatic Logout**: Users are logged out when timeout expires

### 2. **Warning System** ✅
- **Warning Duration**: 2 minutes before timeout (configurable)
- **Visual Warning**: Modal dialog with countdown timer
- **User Actions**: Extend session or logout immediately

### 3. **Activity Detection** ✅
- **Mouse Events**: Clicks, movements, scrolling
- **Keyboard Events**: Key presses, typing
- **Touch Events**: Mobile touch interactions
- **Focus Events**: Window/tab focus changes
- **Throttled Updates**: Prevents excessive API calls

### 4. **User Experience** ✅
- **Non-Intrusive**: Only shows warning when needed
- **Clear Actions**: Easy to extend or logout
- **Real-time Countdown**: Shows exact time remaining
- **Responsive Design**: Works on all devices

## 🏗️ Architecture

### Core Components

1. **SessionTimeoutService** (`lib/auth/session-timeout-service.ts`)
   - Handles inactivity detection
   - Manages timeout timers
   - Triggers callbacks on timeout/warning

2. **useSessionTimeout Hook** (`lib/auth/use-session-timeout.ts`)
   - React hook for session timeout
   - Integrates with auth context
   - Provides timeout state and controls

3. **SessionTimeoutWarning** (`components/session-timeout-warning.tsx`)
   - Warning modal component
   - Countdown timer display
   - User action buttons

4. **SessionTimeoutProvider** (`components/session-timeout-provider.tsx`)
   - Wraps the application
   - Manages warning display
   - Handles user interactions

## 🔧 Configuration

### Default Settings
```typescript
{
  sessionTimeout: 15, // 15 minutes
  sessionWarning: 2,  // 2 minutes warning
  autoValidate: true,
  autoRefresh: true
}
```

### Custom Configuration
You can customize the timeout settings in `app/layout.tsx`:

```typescript
<AuthProvider
  sessionTimeout={30} // 30 minutes
  sessionWarning={5}  // 5 minutes warning
>
  <SessionTimeoutProvider
    timeoutDuration={30} // 30 minutes
    warningDuration={5}  // 5 minutes warning
  >
    {children}
  </SessionTimeoutProvider>
</AuthProvider>
```

## 🧪 Testing

### Test Page
Visit `http://localhost:3000/test-session-timeout` to test the functionality:

1. **Configure Timeout**: Set short durations for testing
2. **Monitor Status**: Watch real-time countdown
3. **Test Activity**: Simulate user interactions
4. **Test Warning**: See warning dialog in action
5. **Test Logout**: Verify automatic logout

### Test Scenarios

1. **Normal Usage**
   - User interacts normally
   - Timer resets on activity
   - No warning shown

2. **Inactivity Warning**
   - User stops interacting
   - Warning appears before timeout
   - User can extend or logout

3. **Automatic Logout**
   - User ignores warning
   - Automatic logout occurs
   - Redirected to login page

4. **Activity Reset**
   - User clicks "Extend Session"
   - Timer resets to full duration
   - Warning disappears

## 📊 Activity Detection

### Monitored Events
- `mousedown` - Mouse clicks
- `mousemove` - Mouse movements
- `keypress` - Keyboard input
- `scroll` - Page scrolling
- `touchstart` - Touch interactions
- `click` - Click events
- `keydown` - Key presses
- `wheel` - Mouse wheel

### Throttling
- Activity updates are throttled to once per second
- Prevents excessive API calls
- Maintains performance

### Visibility Handling
- Pauses monitoring when tab is hidden
- Resumes when tab becomes visible
- Handles focus/blur events

## 🔒 Security Benefits

### 1. **Prevents Unauthorized Access**
- Automatic logout on inactivity
- Reduces risk of session hijacking
- Protects sensitive data

### 2. **Configurable Security Levels**
- Short timeouts for high-security areas
- Longer timeouts for user convenience
- Warning system for user awareness

### 3. **Compliance Ready**
- Meets security requirements
- Audit trail of session activity
- Configurable for different policies

## 🎨 User Interface

### Warning Modal Features
- **Clear Messaging**: Explains what's happening
- **Countdown Timer**: Shows exact time remaining
- **Action Buttons**: Extend session or logout
- **Responsive Design**: Works on all screen sizes
- **Accessible**: Keyboard navigation support

### Visual Design
- **Orange Theme**: Warning colors for visibility
- **Icons**: Clock and warning icons
- **Typography**: Clear, readable text
- **Animations**: Smooth transitions

## 🔧 Customization

### Timeout Durations
```typescript
// Short timeout for sensitive operations
sessionTimeout: 5,  // 5 minutes
sessionWarning: 1,  // 1 minute warning

// Long timeout for user convenience
sessionTimeout: 60, // 1 hour
sessionWarning: 10, // 10 minutes warning
```

### Custom Warning Component
You can create a custom warning component by extending `SessionTimeoutWarning`:

```typescript
import { SessionTimeoutWarning } from '@/components/session-timeout-warning';

// Custom implementation
function CustomWarning(props) {
  return (
    <div className="custom-warning">
      {/* Your custom warning UI */}
    </div>
  );
}
```

### Custom Activity Detection
Extend the `SessionTimeoutService` to add custom activity detection:

```typescript
// Add custom events
const customEvents = ['customEvent1', 'customEvent2'];
customEvents.forEach(event => {
  document.addEventListener(event, throttledUpdate, true);
});
```

## 📱 Mobile Support

### Touch Events
- `touchstart` - Touch interactions
- `touchmove` - Touch movements
- `touchend` - Touch releases

### Responsive Design
- Modal adapts to screen size
- Touch-friendly buttons
- Mobile-optimized layout

## 🐛 Troubleshooting

### Common Issues

1. **Timer Not Starting**
   - Check if user is authenticated
   - Verify component mounting
   - Check console for errors

2. **Warning Not Showing**
   - Verify warning duration is less than timeout
   - Check if `showWarning` is enabled
   - Ensure component is properly mounted

3. **Activity Not Detected**
   - Check if events are being throttled
   - Verify event listeners are attached
   - Test with different interaction types

### Debug Information
Use the test page to debug:
- Real-time timer display
- Activity detection status
- Configuration verification
- Manual testing controls

## 📈 Performance Considerations

### Optimizations
- **Throttled Updates**: Prevents excessive calls
- **Event Delegation**: Efficient event handling
- **Cleanup**: Proper resource cleanup
- **Memory Management**: Prevents memory leaks

### Monitoring
- Console logs for debugging
- Performance metrics
- User interaction tracking
- Error handling

## 🔄 Integration

### With Authentication
- Integrates with existing auth system
- Respects authentication state
- Handles logout properly

### With Other Features
- Works with auto-refresh
- Compatible with session validation
- Integrates with user permissions

## 📝 Best Practices

### 1. **Reasonable Timeouts**
- Balance security with usability
- Consider user workflow
- Test with real users

### 2. **Clear Communication**
- Explain what's happening
- Provide clear actions
- Use appropriate warnings

### 3. **Graceful Handling**
- Handle edge cases
- Provide fallbacks
- Ensure smooth UX

### 4. **Testing**
- Test with different scenarios
- Verify on different devices
- Check accessibility

---

**Note**: The session timeout feature is now fully integrated into your JKKN COE application. Users will be automatically logged out after 15 minutes of inactivity, with a 2-minute warning before logout. This can be customized based on your security requirements.
