"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

interface Task{
  id: string;
  title: string;
  description: string;
  priority: "Low"|"Medium"|"High";
  status: "To Do"|"In Progress"|"Completed"
  assignee: string;
}

const TaskDetailPage = () => {

  const params = useParams();
  const taskId = params.taskId as string;
  const [taskData, settaskData] = useState<Task|null>(null)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null)
  

  const fetchtaskid = () => {
    return new Promise((resolve)=>{
      setTimeout(() => {
        resolve(taskId)
      }, 1000);
    })
  }

  const fetchTaskData = async () => {
    console.log("Fetching Task ID")
    const fetchResult = await fetchtaskid();
    console.log(`TaskId : ${fetchResult}`)
    setLoading(false);

    const mockTaskObject:Task = {
      id: taskId,
      title: "Task1",
      description: "woww task1",
      priority: "Low",
      status: "In Progress",
      assignee: "Atharv Rastogi",
    };

    settaskData(mockTaskObject)
  };

  useEffect(()=>{
    fetchTaskData();
  },[taskId]);

  if (loading) {
    return <div>Loading....</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }
  return(
    <div>
      <h1>Taskid: {taskId}</h1>
    </div>
  );
}

export default TaskDetailPage;