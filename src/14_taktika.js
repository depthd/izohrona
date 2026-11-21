/* Зоны возможной встречи при одновременном выходе сторон. Это модель маршрутов,
   не статистика убийств: гранаты, решения игроков и прострелы требуют демо/игры.
   Чистый модуль: один алгоритм для навов эталонов, генератора и тестов. */
const TACTICS = (() => {
  const dirs=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];
  function nearest(g,w,h,p){
    let best=-1,bd=Infinity;
    for(let i=0;i<g.length;i++) if(g[i]){const d=(i%w-p[0])**2+((i/w|0)-p[1])**2;if(d<bd){best=i;bd=d;}}
    return best;
  }
  function distances(g,w,h,start,z){
    const d=new Float64Array(g.length).fill(Infinity),heap=[];
    const push=(v,i)=>{let k=heap.length;heap.push([v,i]);while(k){const p=(k-1)>>1;if(heap[p][0]<=v)break;heap[k]=heap[p];k=p;}heap[k]=[v,i];};
    if(start<0||!g[start])return d;
    d[start]=0;push(0,start);
    while(heap.length){const [v,i]=heap[0],last=heap.pop();if(heap.length){let k=0;while(k*2+1<heap.length){let c=k*2+1;if(c+1<heap.length&&heap[c+1][0]<heap[c][0])c++;if(heap[c][0]>=last[0])break;heap[k]=heap[c];k=c;}heap[k]=last;}if(v!==d[i])continue;
      const x=i%w,y=i/w|0;
      for(const [dx,dy,c] of dirs){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const j=ny*w+nx;if(!g[j]||(dx&&dy&&(!g[y*w+nx]||!g[ny*w+x])))continue;if(z&&z[j]-z[i]>59/72)continue;const nd=v+c;if(nd<d[j]){d[j]=nd;push(nd,j);}}
    }return d;
  }
  function measure(g,w,h,px,cell=16){
    const points={};for(const k of ['T','CT','A','B'])points[k]=nearest(g,w,h,px[k]);
    const t=distances(g,w,h,points.T),c=distances(g,w,h,points.CT),front=new Uint8Array(g.length);
    let floor=0,reachable=0;
    for(let i=0;i<g.length;i++){if(g[i])floor++;if(Number.isFinite(t[i]))reachable++;if(Number.isFinite(t[i])&&Number.isFinite(c[i])&&Math.abs(t[i]-c[i])*cell/250<.5)front[i]=1;}
    // Group nearby frontier fragments along floor, never through a wall.
    const owner=new Int32Array(g.length).fill(-1),q=new Int32Array(g.length),depth=new Uint16Array(g.length);let head=0,tail=0;
    const parent=[];const root=a=>{while(parent[a]!==a){parent[a]=parent[parent[a]];a=parent[a];}return a;};
    for(let i=0;i<g.length;i++)if(front[i]){owner[i]=parent.length;parent.push(parent.length);q[tail++]=i;}
    const radius=Math.round(128/cell);
    while(head<tail){const i=q[head++],x=i%w,y=i/w|0;for(const [dx,dy] of dirs.slice(0,4)){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const j=ny*w+nx;if(!g[j])continue;if(owner[j]>=0){const a=root(owner[i]),b=root(owner[j]);if(a!==b)parent[b]=a;}else if(depth[i]<radius){owner[j]=owner[i];depth[j]=depth[i]+1;q[tail++]=j;}}}
    const groups=new Map();for(let i=0;i<g.length;i++)if(front[i]){const id=root(owner[i]);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(i);}
    const spots=[...groups.values()].filter(a=>a.length*cell*cell>=768).map(cells=>({cells,area:cells.length*cell*cell,x:cells.reduce((s,i)=>s+i%w,0)/cells.length,y:cells.reduce((s,i)=>s+(i/w|0),0)/cells.length})).sort((a,b)=>b.area-a.area);
    return {spots,front,t,c,points,floor,reachable,maxArea:spots[0]?.area||0,siteMargins:['A','B'].map(k=>(t[points[k]]-c[points[k]])*cell/250)};
  }
  function walking(g,w,h,z){
    const mask=new Uint8Array(g.length),height=new Float32Array(g.length);
    for(let y=0;y<h-1;y++)for(let x=0;x<w-1;x++){const i=y*w+x,block=[i,i+1,i+w,i+w+1];
      if(block.every(j=>g[j])){mask[i]=1;height[i]=Math.max(...block.map(j=>z?z[j]:0));}}
    return {mask,height};
  }
  function shape(g,w,h,px,z,cell=16,occupied,protectedItems){
    const movement=()=>occupied?g.map((v,i)=>v&&!occupied[i]?1:0):g;
    const before=measure(g,w,h,px,cell);let current=before;const walls=[];
    // Reference frontier components: upper end ~90k u² on six repository NAVs.
    // 112k allows discretisation/scale variation; do not force every map to 3 lanes.
    const target=112000;
    for(let pass=0;pass<3&&current.maxArea>target;pass++){
      const spot=current.spots[0],cells=spot.cells;let best=null;
      const walk=walking(movement(),w,h,z),walkStart=nearest(walk.mask,w,h,px.T),walkDist=distances(walk.mask,w,h,walkStart,walk.height);
      const stride=Math.max(1,Math.floor(cells.length/18));
      for(let n=0;n<cells.length;n+=stride){const i=cells[n],x=i%w,y=i/w|0;
        if(Object.entries(px).some(([k,p])=>['T','CT','A','B'].includes(k)&&Math.hypot(x-p[0],y-p[1])*cell<384))continue;
        for(const [dx,dy] of dirs.slice(0,4)){
          let length=0;while(length<Math.round(768/cell)&&g[(y+dy*length)*w+x+dx*length])length++;
          if(length<Math.round(192/cell)||length>=Math.round(768/cell))continue;
          // Leave a usable lane beyond the tip; only place a thin, wall-attached wing.
          let clear=true;for(let k=1;k<=Math.ceil(192/cell);k++){const nx=x-dx*k,ny=y-dy*k;if(nx<1||ny<1||nx>=w-1||ny>=h-1||!g[ny*w+nx]){clear=false;break;}}
          if(!clear)continue;
          const cut=[];let zmin=Infinity,zmax=-Infinity;
          for(let k=0;k<length;k++)for(let b=-1;b<=0;b++){const nx=x+dx*k-dy*b,ny=y+dy*k+dx*b;if(nx<1||ny<1||nx>=w-1||ny>=h-1){clear=false;continue;}const j=ny*w+nx;if(g[j]){cut.push(j);zmin=Math.min(zmin,z?z[j]:0);zmax=Math.max(zmax,z?z[j]:0);}}
          if(!clear||cut.some(j=>protectedItems&&protectedItems[j]))continue;
          for(const j of cut)g[j]=0;
          const m=measure(g,w,h,px,cell);
          const connected=m.reachable>=current.reachable-cut.length;
          const timings=['CT','A','B'].every(k=>Number.isFinite(m.t[m.points[k]])&&(m.t[m.points[k]]-current.t[current.points[k]])*cell/250<2)&&['A','B'].every(k=>Number.isFinite(m.c[m.points[k]])&&(m.c[m.points[k]]-current.c[current.points[k]])*cell/250<2);
          if(connected&&timings&&m.maxArea<current.maxArea*.90&&(!best||m.maxArea<best.m.maxArea)){
            const next=walking(movement(),w,h,z),dist=distances(next.mask,w,h,walkStart,next.height);
            let safe=true;for(let j=0;j<g.length;j++)if(next.mask[j]&&Number.isFinite(walkDist[j])&&!Number.isFinite(dist[j])){safe=false;break;}
            if(safe)best={cut,m,x,y,dx,dy,length};
          }
          for(const j of cut)g[j]=1;
        }
      }
      if(!best)break;for(const j of best.cut)g[j]=0;walls.push({x:best.x,y:best.y,dx:best.dx,dy:best.dy,length:best.length});current=best.m;
    }
    return {before:before.maxArea,after:current.maxArea,spots:current.spots.length,walls};
  }
  return {measure,shape,distances,nearest,walking};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TACTICS;
