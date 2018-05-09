# proffer-stream-to-realtime-tree

takes a stream of [proffer](https://github.com/davidmarkclements/proffer-stream-to-realtime-tree) 
objects and aggregates the data into two D3-style trees
(one for merged stacks, the other for unmerged stacks).

This object continually updates while the stream is live

The object is also a promise which resolves when the stream
ends or rejects if there's a stream error. 

The object is intended to be polled at a comfortable interval
(based on the constraints of UI performance), setting the `fresh`
property on the object to `false` when data has been consumed, 
and checking whether `fresh` is `true` again on the next poll 
(which then indicates there is more data to consume).
  
This is a key component for `0x`, `clinic-flame` and `etna`.