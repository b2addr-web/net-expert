import {Component} from 'react';

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state={error:null};
  }

  static getDerivedStateFromError(error) {
    return {error};
  }

  componentDidCatch(error, info) {
    console.error('Net Expert client error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const error=this.state.error;
    const details=`${error?.name||'Error'}: ${error?.message||String(error)}`;
    return <main dir="rtl" style={{maxWidth:640,margin:'10vh auto',padding:24,fontFamily:'system-ui,sans-serif',lineHeight:1.7}}>
      <h1>تعذر فتح الموقع</h1>
      <p>حدث خطأ أثناء تحميل الصفحة. صوّر التفاصيل أدناه وأرسلها لنا لنحدد السبب.</p>
      <pre dir="ltr" style={{whiteSpace:'pre-wrap',wordBreak:'break-word',padding:16,background:'#f1f5f9',borderRadius:8}}>{details}</pre>
      <button type="button" onClick={()=>window.location.reload()} style={{padding:'10px 20px',fontSize:16}}>إعادة تحميل الصفحة</button>
    </main>;
  }
}
