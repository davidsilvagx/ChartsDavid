export class ResourceCache<T> {
  private values=new Map<string,T>();
  constructor(private capacity:number,private dispose:(value:T)=>void){}
  get size(){return this.values.size;}
  get(key:string){const value=this.values.get(key);if(value!==undefined){this.values.delete(key);this.values.set(key,value);}return value;}
  set(key:string,value:T){
    const old=this.values.get(key);
    if(old!==undefined&&old!==value)this.dispose(old);
    this.values.delete(key);this.values.set(key,value);
    while(this.values.size>this.capacity){const first=this.values.entries().next().value!;this.values.delete(first[0]);this.dispose(first[1]);}
  }
}
